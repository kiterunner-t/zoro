import * as Redux from 'redux';
import createPut from '../src/util/createPut';

describe('FILE: util/createPut', (): void => {
  const store = {
    dispatch(action: Redux.AnyAction): Redux.AnyAction {
      return action;
    },
  } as Redux.Store;

  test('createPut(): dispatch self model action', (): void => {
    const put = createPut(store, 'modelNamespace');
    expect(put({ type: 'action' })).toEqual({ type: 'modelNamespace/action' });
    expect(put({ type: 'modelNamespace/action' })).toEqual({
      type: 'modelNamespace/action',
    });
    expect(put({ type: 'modelNamespace2/action' })).toEqual({
      type: 'modelNamespace2/action',
    });
  });
});
