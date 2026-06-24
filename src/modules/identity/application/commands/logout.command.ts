export class LogoutCommand {
  constructor(
    public readonly userId: string,
    public readonly refreshTokenRaw: string | undefined,
  ) {}
}
