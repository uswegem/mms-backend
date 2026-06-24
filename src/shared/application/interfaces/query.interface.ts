/**
 * CQRS query marker — implement per read model in bounded contexts.
 */
export interface IQuery<TResult = unknown> {
  readonly queryName?: string;
}
