export class MfaVerifyCommand {
  constructor(
    public readonly email: string,
    public readonly mfaCode: string,
  ) {}
}
