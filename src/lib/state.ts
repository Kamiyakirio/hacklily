export type StateUpdate<State> =
  | Partial<State>
  | ((previous: State) => Partial<State>);

/** Reducer for components whose events update several related state fields. */
export function mergeState<State>(
  state: State,
  update: StateUpdate<State>,
): State {
  return {
    ...state,
    ...(typeof update === "function" ? update(state) : update),
  };
}
