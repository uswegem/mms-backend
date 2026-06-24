export class LoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly mfaCode: string | undefined,
    public readonly ipAddress: string | undefined,
    public readonly userAgent: string | undefined,
  ) {}
}
