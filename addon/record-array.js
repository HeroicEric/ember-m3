import { get } from '@ember/object';
import { dasherize } from '@ember/string';
import EmberObject from '@ember/object';
import MutableArray from '@ember/array/mutable';
import { A } from '@ember/array';
import { EmbeddedMegamorphicModel } from './model';
import { resolveReferencesWithInternalModels } from './utils/resolve';
import {
  deferArrayPropertyChange,
  deferPropertyChange,
  flushChanges,
} from './utils/notify-changes';

/**
 * M3RecordArray
 *
 * @class M3RecordArray
 * @extends DS.RecordArray
 */
export default class M3RecordArray extends EmberObject {
  // public RecordArray API

  init() {
    this._internalModels = A();
    super.init(...arguments);
    this._references = [];
    this._resolved = false;
    this.store = this.store || null;
  }

  replace(idx, removeAmt, newRecords) {
    let addAmt = get(newRecords, 'length');
    let newInternalModels = new Array(addAmt);

    if (addAmt > 0) {
      let _newRecords = A(newRecords);
      for (let i = 0; i < newInternalModels.length; ++i) {
        newInternalModels[i] = _newRecords.objectAt(i)._internalModel;
      }
    }

    this._internalModels.replace(idx, removeAmt, newInternalModels);
    this._registerWithInternalModels(newInternalModels);
    this._resolved = true;

    deferArrayPropertyChange(this.store, this, 0, removeAmt, newRecords);
    deferPropertyChange(this.store, this, '[]');
    deferPropertyChange(this.store, this, 'length');
    // eager change events on mutation as mutations are user entry points
    flushChanges(this.store);
  }

  objectAtContent(idx) {
    let internalModel = this._internalModels[idx];
    return internalModel !== null && internalModel !== undefined
      ? internalModel.getRecord()
      : undefined;
  }

  objectAt(idx) {
    this._resolve();
    return this.objectAtContent(idx);
  }

  // RecordArrayManager private api

  _pushInternalModels(internalModels) {
    this._resolve();
    this._internalModels.pushObjects(internalModels);
  }

  _removeInternalModels(internalModels) {
    if (this._resolved) {
      this._internalModels.removeObjects(internalModels);
      deferArrayPropertyChange(this.store, this, 0, internalModels.length, 0);
      deferPropertyChange(this.store, this, '[]');
      deferPropertyChange(this.store, this, 'length');
      // eager change events here; we're not processing payloads (that goes
      // through `_setInternalModels`); we're doing `unloadRecord`
      flushChanges(this.store);
    } else {
      for (let i = 0; i < internalModels.length; ++i) {
        let internalModel = internalModels[i];

        for (let j = 0; j < this._references.length; ++j) {
          let { id, type } = this._references[j];
          let dtype = type && dasherize(type);

          if ((dtype === null || dtype === internalModel.modelName) && id === internalModel.id) {
            this._references.splice(j, 1);
            break;
          }
        }
      }
    }
  }

  // Private API

  _setInternalModels(internalModels, triggerChange = true) {
    let originalLength = this._internalModels.length;
    this._internalModels.replace(0, this._internalModels.length, internalModels);
    if (triggerChange) {
      deferArrayPropertyChange(this.store, this, 0, originalLength, this._internalModels.length);
      deferPropertyChange(this.store, this, '[]');
      deferPropertyChange(this.store, this, 'length');
    }

    this.setProperties({
      isLoaded: true,
      isUpdating: false,
    });

    this._registerWithInternalModels(internalModels);
    this._resolved = true;
  }

  _setReferences(references) {
    this._references = references;
    this._resolved = false;
    let originalLength = this._internalModels.length;
    this._internalModels = A();
    deferArrayPropertyChange(this.store, this, 0, originalLength, this._internalModels.length);
    deferPropertyChange(this.store, this, '[]');
    deferPropertyChange(this.store, this, 'length');
  }

  _registerWithInternalModels(internalModels) {
    for (let i = 0, l = internalModels.length; i < l; i++) {
      let internalModel = internalModels[i];

      // allow refs to point to resources not in the store
      // TODO: instead add a schema missing ref hook; #254
      if (internalModel !== null && internalModel !== undefined) {
        internalModel._recordArrays.add(this);
      }
    }
  }

  _resolve() {
    if (this._resolved) {
      return;
    }

    if (this._references !== null) {
      let internalModels = resolveReferencesWithInternalModels(this.store, this._references);
      this._setInternalModels(internalModels, false);
    }

    this._resolved = true;
  }

  get length() {
    return this._resolved ? this._internalModels.length : this._references.length;
  }
}

M3RecordArray.reopen(MutableArray);

export function associateRecordWithRecordArray(record, recordArray) {
  if (record instanceof EmbeddedMegamorphicModel) {
    // embedded models can be added across tracked arrays (although this is
    // weird) but since they can't be unloaded there's no need to associate the
    // array with the model
    //
    // unloading the top model after adding one of its embedded models to some
    // other tracked array is undefined behaviour
    return;
  }
  record._internalModel._recordArrays.add(recordArray);
}
