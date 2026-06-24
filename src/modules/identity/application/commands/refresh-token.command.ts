export class RefreshTokenCommand {
  constructor(
    public readonly refreshTokenRaw: string,
    public readonly ipAddress: string | undefined,
  ) {}
}
