// One-time Vault Transit setup for RS256 JWT signing (auth migration brief §2.2).
// Idempotent — safe to re-run against an already-configured Vault.
//
// Usage: VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=<root-or-admin-token> \
//        node scripts/setup-vault-transit.mjs
//
// What this does:
//   1. Enables the transit secrets engine (no-op if already enabled).
//   2. Creates the `mms-jwt-signing` key (rsa-2048, non-exportable). Also
//      creates the QR-signing key from §5.1 if it doesn't exist yet — same
//      engine, separate named key, never shared.
//   3. Writes a policy scoped to sign/read/rotate on those two keys only —
//      no blanket transit access.
//   4. Enables AppRole auth and creates a role bound to that policy,
//      printing the Role ID + a fresh Secret ID for the backend's .env.
//
// Dev-mode Vault (docker-compose) already has a root token — this script
// still creates the least-privilege AppRole so the *application* never runs
// with root, even locally. Production Vault deployment target (self-hosted
// on Hetzner vs. managed) is still open — see docs/architecture-decisions.

const VAULT_ADDR = process.env.VAULT_ADDR ?? 'http://127.0.0.1:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const JWT_KEY_NAME = process.env.VAULT_JWT_KEY_NAME ?? 'mms-jwt-signing';
const QR_KEY_NAME = process.env.VAULT_QR_KEY_NAME ?? 'mms-qr-signing';
const POLICY_NAME = 'mms-backend-signing';
const APPROLE_NAME = 'mms-backend';

if (!VAULT_TOKEN) {
  console.error('VAULT_TOKEN is required (dev-mode root token or an admin token).');
  process.exit(1);
}

async function vault(method, path, body) {
  const res = await fetch(`${VAULT_ADDR}/v1/${path}`, {
    method,
    headers: {
      'X-Vault-Token': VAULT_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    throw new Error(`Vault ${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureTransitEnabled() {
  const mounts = await vault('GET', 'sys/mounts');
  if (mounts?.data?.['transit/']) {
    console.log('transit/ already enabled');
    return;
  }
  await vault('POST', 'sys/mounts/transit', { type: 'transit' });
  console.log('Enabled transit secrets engine');
}

async function ensureKey(name, type) {
  const existing = await vault('GET', `transit/keys/${name}`);
  if (existing) {
    console.log(`Key "${name}" already exists (latest version ${existing.data.latest_version})`);
    return;
  }
  await vault('POST', `transit/keys/${name}`, { type, exportable: false });
  console.log(`Created key "${name}" (${type}, non-exportable)`);
}

async function writePolicy() {
  const policy = `
path "transit/sign/${JWT_KEY_NAME}/*" { capabilities = ["update"] }
path "transit/keys/${JWT_KEY_NAME}"   { capabilities = ["read"] }
path "transit/keys/${JWT_KEY_NAME}/rotate" { capabilities = ["update"] }
path "transit/sign/${QR_KEY_NAME}/*"  { capabilities = ["update"] }
path "transit/keys/${QR_KEY_NAME}"    { capabilities = ["read"] }
`.trim();
  await vault('PUT', `sys/policies/acl/${POLICY_NAME}`, { policy });
  console.log(`Wrote policy "${POLICY_NAME}" (sign/read/rotate on ${JWT_KEY_NAME} and ${QR_KEY_NAME} only)`);
}

async function ensureAppRole() {
  const mounts = await vault('GET', 'sys/auth');
  if (!mounts?.data?.['approle/']) {
    await vault('POST', 'sys/auth/approle', { type: 'approle' });
    console.log('Enabled approle auth method');
  }

  await vault('POST', `auth/approle/role/${APPROLE_NAME}`, {
    token_policies: POLICY_NAME,
    token_ttl: '15m',
    token_max_ttl: '1h',
    secret_id_ttl: '90d',
  });

  const roleId = await vault('GET', `auth/approle/role/${APPROLE_NAME}/role-id`);
  const secretId = await vault('POST', `auth/approle/role/${APPROLE_NAME}/secret-id`, {});

  console.log('\nAppRole ready. Add to .env (never commit these):');
  console.log(`VAULT_ROLE_ID=${roleId.data.role_id}`);
  console.log(`VAULT_SECRET_ID=${secretId.data.secret_id}`);
  console.log(
    '\nSecret ID TTL is 90 days — rotating it before expiry is an operational task, not yet automated.',
  );
}

async function main() {
  await ensureTransitEnabled();
  await ensureKey(JWT_KEY_NAME, 'rsa-2048');
  await ensureKey(QR_KEY_NAME, 'rsa-2048');
  await writePolicy();
  await ensureAppRole();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
