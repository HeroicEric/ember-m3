import { get } from '@ember/object';
import { dasherize } from '@ember/string';
import ArrayProxy from '@ember/array/proxy';
import { A } from '@ember/array';
import { EmbeddedMegamorphicModel } from './model';
import { resolveReferencesWithInternalModels } from './utils/resolve';

/**
 * M3RecordArray
 *
 * @class M3RecordArray
 * @extends DS.RecordArray
 */
export default class M3RecordArray extends ArrayProxy {
  // public RecordArray API

  init() {
    // content must be set before super.init because that will install array
    // observers
    this.content = A();
    super.init(...arguments);
    this._references = [];
    this._internalModels = [];
    this._resolved = false;
    this.store = this.store || null;
  }

  replace(idx, removeAmt, newRecords) {
    this.replaceContent(idx, removeAmt, newRecords);
  }

  replaceContent(idx, removeAmt, newRecords) {
    //debugger
    let addAmt = get(newRecords, 'length');
    let newInternalModels = new Array(addAmt);

    if (addAmt > 0) {
      let _newRecords = A(newRecords);
      for (let i = 0; i < newInternalModels.length; ++i) {
        newInternalModels[i] = _newRecords.objectAt(i);
      }
    }

    this.content.replace(idx, removeAmt, newInternalModels);
    this._registerWithInternalModels(newInternalModels);
    this._resolved = true;
  }

  objectAtContent(idx) {
    /*
    let internalModel = this.content[idx];
    return internalModel !== null && internalModel !== undefined
      ? internalModel.getRecord()
      : undefined;
      */
    let record = this.content[idx];
    return record;
  }

  objectAt(idx) {
    this._resolve();
    return super.objectAt(idx);
  }

  // RecordArrayManager private api

  _pushInternalModels(internalModels) {
    //debugger
    this._resolve();
    this.content.pushObjects(internalModels);
  }

  _removeInternalModels(internalModels) {
    //debugger
    if (this._resolved) {
      this.content.removeObjects(internalModels);
    } else {
      for (let i = 0; i < internalModels.length; ++i) {
        let internalModel = internalModels[i];

        for (let j = 0; j < this.content.length; ++j) {
          let { id, type } = this.content[j];
          let dtype = type && dasherize(type);

          if ((dtype === null || dtype === internalModel.modelName) && id === internalModel.id) {
            this.content.removeAt(j);
            break;
          }
        }
      }
    }
  }

  // Private API

  _setInternalModels(internalModels, triggerChange = true) {
    if (triggerChange) {
      this.content.replace(0, this.content.length, internalModels);
    } else {
      this.content.splice(0, this.content.length, ...internalModels);
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
    // change event for this.content so we re-resolve next time something is
    // asked for
    this.content.setObjects(this._references);
  }

  _removeRecordData(recordData) {
    for (let i = this.content.length; i >= 0; --i) {
      let item = this.content.objectAt(i);
      if (item && recordData === item._recordData) {
        this.content.removeAt(i);
        break;
      }
    }
  }

  _registerWithInternalModels(records) {
    //debugger;
    /*
    for (let i = 0, l = internalModels.length; i < l; i++) {
      let internalModel = internalModels[i];

      // allow refs to point to resources not in the store
      // TODO: instead add a schema missing ref hook; #254
      if (internalModel !== null && internalModel !== undefined) {
        internalModel._recordArrays.add(this);
      }
    }
    */
    records.forEach(record => record && record._recordData._recordArrays.add(this));
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

  // The length property can be removed entirely once our ember-source peer dep
  // is >= 3.1.0.
  //
  // It is not safe to override a getter on a superclass that specifies a
  // setter as a matter of OO + es6 class semantics.

  get length() {
    return this.content && this.content.length !== undefined ? this.content.length : 0;
  }

  set length(v) {}
}

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
  record._recordData._recordArrays.add(recordArray);
}
