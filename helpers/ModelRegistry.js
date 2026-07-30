// A tiny indirection that lets model classes look each other up by model_type.
//
// BaseModelClass cannot simply import ModelIndex/CustomModelIndex to do this: every model
// extends BaseModelClass, so those barrels and this base class form an import cycle, and a
// custom model would be evaluated while BaseModelClass itself is still initializing
// ("Cannot access 'BaseModelClass' before initialization"). ModelEngine fills this registry
// once at startup with the merged built-in + custom map, keyed by static model_type, and
// consumers read it lazily at build time when the module graph is complete.

let registry = {};

export const set_model_registry = function (model_map) {
  registry = model_map || {};
};

export const get_model_class = function (model_type) {
  return registry[model_type];
};
