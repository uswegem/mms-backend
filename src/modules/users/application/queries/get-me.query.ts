import { ActorContext } from '@shared/application/interfaces/actor-context.interface';

export class GetMeQuery {
  constructor(public readonly actor: ActorContext) {}
}
