import { PaymentsGateway } from './payments.gateway';

describe('PaymentsGateway — connection auth and room scoping', () => {
  function buildFakeSocket(
    overrides: {
      authToken?: string;
      authHeader?: string;
    } = {},
  ) {
    return {
      handshake: {
        auth:
          overrides.authToken !== undefined
            ? { token: overrides.authToken }
            : {},
        headers: overrides.authHeader
          ? { authorization: overrides.authHeader }
          : {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
  }

  function buildGateway(
    verifyImpl: (token: string) => Promise<Record<string, unknown>>,
  ) {
    const tokens = { verifyAccessToken: jest.fn(verifyImpl) };
    const gateway = new PaymentsGateway(tokens as never);
    return { gateway, tokens };
  }

  it('joins the merchant-scoped room for a valid access token naming a merchant', async () => {
    const { gateway } = buildGateway(() =>
      Promise.resolve({
        type: 'access',
        sub: 'user-1',
        merchantId: 'merchant-1',
      }),
    );
    const socket = buildFakeSocket({ authToken: 'valid-token' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('merchant:merchant-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a valid back-office token (no merchantId) without joining any room', async () => {
    const { gateway } = buildGateway(() =>
      Promise.resolve({ type: 'access', sub: 'admin-1' }),
    );
    const socket = buildFakeSocket({ authToken: 'valid-token' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket presenting no token at all', async () => {
    const { gateway, tokens } = buildGateway(() =>
      Promise.resolve({ type: 'access' }),
    );
    const socket = buildFakeSocket();

    await gateway.handleConnection(socket as never);

    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket whose token fails verification', async () => {
    const { gateway } = buildGateway(() =>
      Promise.reject(new Error('invalid signature')),
    );
    const socket = buildFakeSocket({ authToken: 'forged-token' });

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket presenting a refresh-typed token instead of an access token', async () => {
    const { gateway } = buildGateway(() =>
      Promise.resolve({
        type: 'refresh',
        sub: 'user-1',
        merchantId: 'merchant-1',
      }),
    );
    const socket = buildFakeSocket({ authToken: 'refresh-token' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('falls back to an Authorization header when handshake.auth.token is absent', async () => {
    const { gateway } = buildGateway(() =>
      Promise.resolve({ type: 'access', merchantId: 'merchant-2' }),
    );
    const socket = buildFakeSocket({ authHeader: 'Bearer header-token' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('merchant:merchant-2');
  });

  it("publishes only to the target merchant's room, not broadcast-wide", () => {
    const { gateway } = buildGateway(() => Promise.resolve({}));
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: { to: typeof to } }).server = { to };

    gateway.publishPaymentConfirmed('merchant-1', {
      paymentId: 'p1',
      tipsEndToEndId: 'T1',
      amount: '100',
      currency: 'TZS',
      channel: 'QR',
      receivedAt: new Date().toISOString(),
    });

    expect(to).toHaveBeenCalledWith('merchant:merchant-1');
    expect(emit).toHaveBeenCalledWith(
      'payment.confirmed',
      expect.objectContaining({ paymentId: 'p1' }),
    );
  });
});
