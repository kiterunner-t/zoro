import { Reducer, AnyAction, Dispatch } from 'redux';
import { Select } from '../util/createSelect';
import createReducer, { CustomReducers } from '../util/createReducer';
import { assert } from '../util/utils';

export interface Operators {
  selectAll: Select;
  select: Select;
  put: Dispatch;
}

export type Effect = (
  action: AnyAction,
  operators: Operators,
) => void | Promise<any>;

export interface Effects {
  [propName]: Effect;
}

export type ActionCreator = (
  payload?: any,
  meta?: any,
  error?: boolean,
) => AnyAction;

export interface ActionCreators {
  [propName]: ActionCreator;
}

export type Setup = (operator: Operators) => void;

export interface Options {
  namespace: string;
  state?: any;
  reducers?: CustomReducers;
  effects?: Effects;
  setup?: Setup;
}

function assertOptions(options: Options): void {
  const { namespace, reducers = {}, effects = {}, setup = noop } = options;

  assert(
    typeof namespace === 'string',
    `the model's namespace is necessary, but we get ${namespace}`,
  );
  assert(
    typeof reducers === 'object' && reducers !== null,
    `the ${namespace} model reducers must an Object, but we get ${typeof reducers}`,
  );
  assert(
    typeof effects === 'object' && effects !== null,
    `the ${namespace} model effects must an Object, but we get ${typeof effects}`,
  );
  assert(
    typeof setup === 'function',
    `the ${namespace} setup must be a Function, but we get ${typeof setup}`,
  );
}

class Model {
  private namespace: string;

  private initState: any;

  private reducer: Reducer<any, AnyAction>;

  private effects: Effects = {};

  private actionCreators: ActionCreators = {};

  private setup: Setup = noop;

  private createReducer(
    reducers?: CustomReducers = {},
  ): Reducer<any, AnyAction> {
    const reducerHandlers: CustomReducers = Object.keys(reducers).reduce(
      (combine: CustomReducers, key: string): CustomReducers => {
        const reducerHandler: CustomReducer = reducers[key];
        assert(
          typeof reducerHandler === 'function',
          `the reducer must be an function, but we get ${typeof reducerHandler} with type ${key}`,
        );

        const type = `${this.getNamespace()}${NAMESPACE_DIVIDER}${key}`;
        return { ...combine, [type]: this.reducerHandler };
      },
      {},
    );

    return createReducer(this.getInitState(), reducerHandlers);
  }

  private createEffects(effects?: Effects = {}): Effects {
    return Object.keys(effects).reduce(
      (combine: Effects, key: string): Effects => {
        const effect: Effect = effects[key];
        assert(
          typeof effect === 'function',
          `the effect must be an function, but we get ${typeof effect} with type ${key}`,
        );
        const type = `${this.getNamespace()}${NAMESPACE_DIVIDER}${key}`;
        return { ...combine, [type]: effect };
      },
      {},
    );
  }

  private createActionCreators(
    reducers?: CustomReducers = {},
    effects?: Effects = {},
  ): ActionCreators {
    const self = this;
    return Object.keys({ ...reducers, ...effects }).reduce(
      (combine: ActionCreators, key: string): ActionCreators => {
        combine[key] = function actionCreator(
          payload?: any,
          meta?: any,
          error?: boolean,
        ): AnyAction {
          return {
            type: `${self.getNamespace()}${NAMESPACE_DIVIDER}${key}`,
            payload,
            meta,
            error,
          };
        };

        return combine;
      },
      {},
    );
  }

  public constructor(options: Options) {
    assertOptions(options);

    const { namespace, state, reducers, effects, setup } = options;

    this.namespace = namespace;
    this.initState = state;
    this.reducer = this.createReducer(reducers);
    this.effects = this.createEffects(effects);
    this.actionCreators = this.createActionCreators(reducers, effects);
    this.setup = setup;
  }

  public getNamespace(): string {
    return this.namespace;
  }

  public getInitState(): any {
    return this.initState;
  }

  public getReducer(): Reducer<any, AnyAction> {
    return this.reducer;
  }

  public getEffects(): Effects {
    return this.effects;
  }

  public getActionCreators(): ActionCreators {
    return this.actionCreators;
  }

  public getSetup(): Setup {
    return this.setup;
  }
}

export default Model;
