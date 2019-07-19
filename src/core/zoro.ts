import {
  Middleware,
  StoreEnhancer,
  AnyAction,
  Reducer,
  Store,
  combineReducers,
} from 'redux';
import createReduxStore, { GlobalState } from './store';
import Model, {
  Option as ModelOption,
  GlobalOperator,
  Setup as ModelSetup,
  Effects as ModelEffects,
} from './model';
import effectMiddlewareCreator from './effectMiddleware';
import Plugin from '../util/plugin';
import { assert, noop } from '../util/utils';
import {
  PLUGIN_EVENT,
  NAMESPACE_DIVIDER,
  PluginEvent,
  INTERCEPT_TYPE,
  INTERCEPT_ACTION,
  INTERCEPT_EFFECT,
} from '../util/constant';
import createPut from '../util/createPut';
import createSelect from '../util/createSelect';

export interface Models {
  [namespace: string]: Model;
}

export type OnError = (e: Error) => void;

export type OnAction = (action: AnyAction) => void;

export interface OnReducerOption {
  namespace: string;
  [propName: string]: any;
}

export type OnReducer = (
  reducer: Reducer<any, AnyAction>,
  option: OnReducerOption,
) => Reducer<any, AnyAction>;

export type OnSetup = (operator: GlobalOperator) => void;

export interface State {
  [namespace: string]: any;
}

export interface Option {
  initialState?: State;
  extraMiddlewares?: Middleware[];
  extraEnhancers?: StoreEnhancer[];
  onEffect?: OnAction;
  onAction?: OnAction;
  onReducer?: OnReducer;
  onSetup?: OnSetup;
  onError?: OnError;
}

export interface Reducers {
  [namespace: string]: Reducer<any, AnyAction>;
}

export interface PluginCreatorOption {
  DIVIDER: string;
  PLUGIN_EVENT: PluginEvent;
}

export type PluginCreator = (
  plugin: Plugin,
  option: PluginCreatorOption,
) => void;

export interface InterceptOption {
  store: Store<GlobalState>;
  NAMESPACE_DIVIDER: string;
}

export type ActionIntercept = (
  action: AnyAction,
  option: InterceptOption,
) => void | AnyAction;

export type EffectIntercept = (
  action: AnyAction,
  option: InterceptOption,
) => Promise<void> | Promise<AnyAction>;

export interface Intercepts {
  [INTERCEPT_ACTION]: ActionIntercept[];
  [INTERCEPT_EFFECT]: EffectIntercept[];
}

function assertOptions(option: Option): void {
  const {
    initialState = {},
    extraMiddlewares = [],
    extraEnhancers = [],
    onEffect = noop,
    onAction = noop,
    onReducer = noop,
    onSetup = noop,
    onError = noop,
  } = option;

  assert(
    typeof initialState === 'object' && initialState !== null,
    `initialState must be an Object, but we get ${typeof initialState}`,
  );
  assert(
    extraMiddlewares instanceof Array,
    `extraMiddlewares must be an Array, but we get ${typeof extraMiddlewares}`,
  );
  assert(
    extraEnhancers instanceof Array,
    `extraEnhancers must be an Array, but we get ${typeof extraEnhancers}`,
  );
  assert(
    typeof onEffect === 'function',
    `the onEffect must be an function handler, but we get ${typeof onEffect}`,
  );
  assert(
    typeof onAction === 'function',
    `the onAction must be an function handler, but we get ${typeof onAction}`,
  );
  assert(
    typeof onReducer === 'function',
    `the onReducer must be an function handler, but we get ${typeof onReducer}`,
  );
  assert(
    typeof onSetup === 'function',
    `the onSetup must be an function handler, but we get ${typeof onSetup}`,
  );
  assert(
    typeof onError === 'function',
    `the onError must be an function handler, but we get ${typeof onError}`,
  );
}

class Zoro {
  private initState: State = {};

  private models: Models = {};

  private modelOptions: ModelOption[] = [];

  private middlewares: Middleware[] = [];

  private enhancers: StoreEnhancer[] = [];

  private isSetup: boolean = false;

  private plugin: Plugin;

  private store: Store<GlobalState>;

  private intercepts: Intercepts = {
    [INTERCEPT_ACTION]: [],
    [INTERCEPT_EFFECT]: [],
  };

  public onError?: OnError;

  public onEffect?: OnAction;

  public onAction?: OnAction;

  public onReducer?: OnReducer;

  public onSetup?: OnSetup;

  public constructor(option: Option = {}) {
    assertOptions(option);

    const {
      initialState,
      extraMiddlewares,
      extraEnhancers,
      onEffect,
      onAction,
      onReducer,
      onSetup,
      onError,
    } = option;

    this.plugin = new Plugin();

    if (initialState) {
      this.initState = initialState;
    }

    if (extraEnhancers) {
      this.enhancers = extraEnhancers;
    }

    if (onEffect) {
      this.onEffect = onEffect;
    }

    if (onAction) {
      this.onAction = onAction;
    }

    if (onReducer) {
      this.onReducer = onReducer;
    }

    if (onSetup) {
      this.onSetup = onSetup;
    }

    if (onError) {
      this.onError = onError;
    }

    this.middlewares = [effectMiddlewareCreator(this)];
    if (extraMiddlewares) {
      this.middlewares = this.middlewares.concat(extraMiddlewares);
    }
  }

  private getRootReducer(): Reducer<any, AnyAction> {
    const rootReducer: Reducers = Object.keys(this.models).reduce(
      (reducers: Reducers, namespace: string): Reducers => {
        const model: Model = this.models[namespace];
        let reducer: Reducer<any, AnyAction> = model.getReducer();

        if (this.onReducer) {
          const nextReducer = this.onReducer(reducer, { namespace });

          if (typeof nextReducer === 'function') {
            reducer = nextReducer;
          } else {
            console.warn(
              `onReducer need return a Reducer, but we get ${typeof nextReducer}`,
            );
          }
        }

        const nextReducer = this.getPlugin().emitWithLoop(
          PLUGIN_EVENT.ON_REDUCER,
          reducer,
          { namespace },
        );

        if (typeof nextReducer === 'function') {
          reducer = nextReducer;
        }

        reducers[namespace] = reducer;

        return reducers;
      },
      {},
    );

    return combineReducers(rootReducer);
  }

  private getInitState(): State {
    const pluginInitState = this.getPlugin().emitWithLoop(
      PLUGIN_EVENT.INJECT_INITIAL_STATE,
      this.initState,
    );

    return {
      ...this.initState,
      ...pluginInitState,
    };
  }

  private replaceReducer(): void {
    const rootReducer: Reducer<any, AnyAction> = this.getRootReducer();
    this.getStore().replaceReducer(rootReducer);
  }

  private createModel(modelOption: ModelOption): Model {
    let nextModelOption = this.getPlugin().emitWithLoop(
      PLUGIN_EVENT.ON_BEFORE_CREATE_MODEL,
      modelOption,
    );

    if (typeof nextModelOption !== 'object' || nextModelOption === null) {
      nextModelOption = modelOption;
    }

    const initState = this.getInitState();
    if (
      typeof nextModelOption.state === 'undefined' &&
      typeof nextModelOption.namespace === 'string'
    ) {
      nextModelOption.state = initState[nextModelOption.namespace];
    }

    const model: Model = new Model(nextModelOption);
    const namespace = model.getNamespace();
    assert(
      typeof this.models[namespace] === 'undefined',
      `the model namespace must be unique, we get duplicate namespace ${namespace}`,
    );
    this.models[namespace] = model;
    this.getPlugin().emit(PLUGIN_EVENT.ON_AFTER_CREATE_MODEL, model);

    return model;
  }

  private createModels(modelOptions: ModelOption[]): Models {
    return modelOptions.reduce(
      (models: Models, modelOption: ModelOption): Models => {
        const model = this.createModel(modelOption);
        models[model.getNamespace()] = model;

        return models;
      },
      {},
    );
  }

  private injectPluginMiddlewares(): void {
    const pluginMiddlewares = this.getPlugin().emitWithResultSet(
      PLUGIN_EVENT.INJECT_MIDDLEWARES,
    );

    if (typeof pluginMiddlewares !== 'undefined') {
      assert(
        pluginMiddlewares instanceof Array,
        `the inject plugin middlewares must be an Array, but we get ${typeof pluginMiddlewares}`,
      );
      this.middlewares = this.middlewares.concat(pluginMiddlewares);
    }
  }

  private injectPluginEnhancers(): void {
    const pluginEnhancers = this.getPlugin().emitWithResultSet(
      PLUGIN_EVENT.INJECT_ENHANCERS,
    );

    if (typeof pluginEnhancers !== 'undefined') {
      assert(
        pluginEnhancers instanceof Array,
        `the inject plugin enhancers must be an Array, but we get ${typeof pluginEnhancers}`,
      );
      this.enhancers = this.enhancers.concat(pluginEnhancers);
    }
  }

  private injectPluginModels(): void {
    const pluginModels = this.getPlugin().emitWithResultSet(
      PLUGIN_EVENT.INJECT_MODELS,
    );
    if (typeof pluginModels !== 'undefined') {
      assert(
        pluginModels instanceof Array,
        `the inject plugin models must be an Array, but we get ${typeof pluginModels}`,
      );

      this.setModels(pluginModels);
    }
  }

  private createStore(): Store<GlobalState> {
    const rootReducer: Reducer<any, AnyAction> = this.getRootReducer();
    this.injectPluginMiddlewares();
    this.injectPluginEnhancers();

    return createReduxStore({
      rootReducer,
      middlewares: this.middlewares,
      enhancers: this.enhancers,
    });
  }

  private setupModel(models: Models): void {
    const store = this.getStore();

    Object.keys(models).forEach((namespace: string): void => {
      const model: Model = models[namespace];
      this.getPlugin().emit(PLUGIN_EVENT.ON_SETUP_MODEL, model);
      const setup: ModelSetup | undefined = model.getSetup();
      if (typeof setup === 'function') {
        setup({
          put: createPut(store, namespace),
          select: createSelect(store, namespace),
          selectAll: createSelect(store),
        });
      }
    });
  }

  public getPlugin(): Plugin {
    return this.plugin;
  }

  public getStore(): Store<GlobalState> {
    assert(
      typeof this.store !== 'undefined',
      'the redux store is not create before call start()',
    );

    return this.store;
  }

  public getIntercepts(type: string): ActionIntercept[] | EffectIntercept[] {
    return this.intercepts[type] || [];
  }

  public getModel(namespace: string): Model {
    const model: Model = this.models[namespace];
    assert(
      typeof model !== 'undefined',
      `the ${namespace} model unkown when get model`,
    );

    return model;
  }

  public getModelEffects(namespace: string): ModelEffects {
    const model: Model = this.models[namespace];
    assert(
      typeof model !== 'undefined',
      `the ${namespace} model unkown when get model effects`,
    );

    return model.getEffects();
  }

  public setModel(modelOption: ModelOption): void {
    this.modelOptions.push(modelOption);
    if (this.store) {
      const model: Model = this.createModel(modelOption);
      this.replaceReducer();

      if (this.isSetup) {
        this.setupModel({ [model.getNamespace()]: model });
      }
    }
  }

  public setModels(modelOptions: ModelOption[]): void {
    assert(
      modelOptions instanceof Array,
      `the models must be an Array, but we get ${typeof modelOptions}`,
    );

    this.modelOptions = this.modelOptions.concat(modelOptions);

    if (this.store) {
      const models: Models = this.createModels(modelOptions);
      this.replaceReducer();

      if (this.isSetup) {
        this.setupModel(models);
      }
    }
  }

  public setIntercept(
    type: string,
    intercept: ActionIntercept | EffectIntercept,
  ): void {
    assert(
      INTERCEPT_TYPE.indexOf(type) !== -1,
      `we get an unkown intercept type, it's ${type}`,
    );

    assert(
      typeof intercept === 'function',
      `the intercept must be a Function, but we get ${typeof intercept}`,
    );

    if (!(this.intercepts[type] instanceof Array)) {
      this.intercepts[type] = [];
    }

    this.intercepts[type].push(intercept);
  }

  public usePlugin(pluginCreator: PluginCreator): void {
    assert(
      typeof pluginCreator === 'function',
      `the use plugin must be a function, but we get ${typeof pluginCreator}`,
    );

    pluginCreator(this.getPlugin(), {
      DIVIDER: NAMESPACE_DIVIDER,
      PLUGIN_EVENT,
    });
  }

  public start(setup: boolean = true): Store<GlobalState> {
    this.injectPluginModels();
    this.createModels(this.modelOptions);
    const store = (this.store = this.createStore());

    store.subscribe((): void => {
      const plugin = this.getPlugin();
      if (plugin.has(PLUGIN_EVENT.ON_SUBSCRIBE)) {
        plugin.emit(PLUGIN_EVENT.ON_SUBSCRIBE, store);
      }
    });

    if (setup) {
      this.setup();
    }

    return store;
  }

  public setup(): void {
    if (this.isSetup) {
      return;
    }

    const store = this.getStore();

    this.setupModel(this.models);

    if (typeof this.onSetup === 'function') {
      this.onSetup({
        put: createPut(store),
        select: createSelect(store),
      });
    }
    this.getPlugin().emit(PLUGIN_EVENT.ON_SETUP, store);
  }
}

export default Zoro;
