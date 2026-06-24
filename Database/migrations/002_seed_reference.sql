-- Reference data required before merchant inserts
INSERT INTO mcc_reference (code, description, category) VALUES
  ('0000', 'Default / Not specified', 'General'),
  ('5814', 'Fast food restaurants', 'Food'),
  ('8211', 'Elementary and secondary schools', 'Education')
ON CONFLICT (code) DO NOTHING;

INSERT INTO postcode_reference (code, region, city) VALUES
  ('11000', 'Dar es Salaam', 'Dar es Salaam'),
  ('41000', 'Dodoma', 'Dodoma'),
  ('25000', 'Arusha', 'Arusha')
ON CONFLICT (code) DO NOTHING;

INSERT INTO onboarding_rejection_reasons (code, description) VALUES
  ('KYC_INCOMPLETE', 'Incomplete KYC documentation'),
  ('AML_FAIL', 'AML screening failed'),
  ('ACCOUNT_MISMATCH', 'Settlement account verification failed'),
  ('RISK_HIGH', 'Risk score above threshold')
ON CONFLICT (code) DO NOTHING;
