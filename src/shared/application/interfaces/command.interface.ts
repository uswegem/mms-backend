/**
 * CQRS command marker — implement per use case in bounded contexts.
 */
export interface ICommand {
  readonly commandName?: string;
}
