//define AutoForm object; used for forms that are not related to collections

// @export AutoForm
AutoForm = function(schema) {
    var self = this;
    //public properties
    self.invalidFields = [];
    self.deps = {};
    //set up validation dependencies
    var fieldNames = _.keys(schema);
    _.each(fieldNames, function(name) {
        self.deps[name] = new Deps.Dependency;
    });
    //private properties
    self._schema = schema;
    self._simpleSchema = new SimpleSchema(schema);
};

_.extend(AutoForm.prototype, {
    callbacks: function(cb) {
        this._callbacks = cb;
    },
    validate: function(doc) {
        var self = this,
                schema = self._simpleSchema,
                addedFields = [],
                removedFields = [],
                changedFields = [];

        //whitelist
        doc = schema.filter(doc);
        doc = schema.autoTypeConvert(doc);

        //note any currently invalid fields so that we can mark them as changed
        //due to new validation (they may be valid now, or invalid in a different way)
        _.each(self.invalidFields, function(obj) {
            removedFields.push(obj.name);
        });

        //perform validation
        self.invalidFields = schema.validate(doc);

        //add newly invalid fields to changedFields
        _.each(self.invalidFields, function(obj) {
            addedFields.push(obj.name);
        });

        //mark all changed fields as changed
        changedFields = _.union(addedFields, removedFields);
        _.each(changedFields, function(name) {
            self.deps[name].changed();
        });
        
        return !!self.invalidFields.length;
    },
    resetValidation: function() {
        var self = this, removedFields = [];
        _.each(self.invalidFields, function(obj) {
            removedFields.push(obj.name);
        });
        self.invalidFields = [];
        _.each(removedFields, function(name) {
            self.deps[name].changed();
        });
    },
    schema: function(field) {
        if (field) {
            return this._schema[field];
        } else {
            return this._schema;
        }
    }
});

//add callbacks() method to Meteor.Collection2
_.extend(Meteor.Collection2.prototype, {
    callbacks: function(cb) {
        this._callbacks = cb;
    }
});

if (typeof Handlebars !== 'undefined') {
    Handlebars.registerHelper("autoForm", function(options) {
        if (!options) {
            return "";
        }
        if (!window || (!window[options.hash.collection] && !window[options.hash.schema])) {
            return options.fn(this);
        }
        var context, autoFormContext = {};
        if (options.hash.collection) {
            context = {_c2: window[options.hash.collection], _doc: options.hash.doc};
            autoFormContext.collection = options.hash.collection;
        } else {
            context = {_ss: window[options.hash.schema], _doc: options.hash.doc};
            autoFormContext.schema = options.hash.schema;
        }
        autoFormContext.content = options.fn(context);
        return new Handlebars.SafeString(Template._autoForm(autoFormContext));
    });
    Handlebars.registerHelper("afFieldMessage", function(name) {
        var self = this;
        var obj = self._c2 || self._ss;
        if (!obj) {
            return "";
        }
        var dep = obj.deps[name];
        if (dep) {
            dep.depend();
        }
        if (!obj.invalidFields || !obj.invalidFields.length) {
            return "";
        }
        var fieldObj = _.findWhere(obj.invalidFields, {name: name});
        return fieldObj ? fieldObj.message : "";
    });
    Handlebars.registerHelper("afFieldIsInvalid", function(name) {
        var self = this;
        var obj = self._c2 || self._ss;
        if (!obj) {
            return false;
        }
        var dep = obj.deps[name];
        if (dep) {
            dep.depend();
        }
        if (!obj.invalidFields || !obj.invalidFields.length) {
            return false;
        }
        return _.contains(_.map(obj.invalidFields, function(o) {
            return o.name;
        }), name);
    });
    Handlebars.registerHelper("afFieldInput", function(name, options) {
        var html, self = this;
        var obj = self._c2 || self._ss;
        if (!obj) {
            return "";
        }
        var hash = options && options.hash ? options.hash : {};
        var defs = obj.schema(name);
        if (!defs) {
            throw new Error("Invalid field name");
        }

        //get current value
        var value, arrayVal;
        if (_.isArray(defs.type)) {
            if (defs.type[0] === Date) {
                if (self._doc && name in self._doc) {
                    arrayVal = self._doc[name];
                    value = [];
                    _.each(arrayVal, function(v) {
                        value.push(dateToFieldDateString(v));
                    });
                } else {
                    value = [];
                }
            } else {
                if (self._doc && name in self._doc) {
                    arrayVal = self._doc[name];
                    value = [];
                    _.each(arrayVal, function(v) {
                        value.push(v.toString());
                    });
                } else {
                    value = [];
                }
            }
        } else {
            if (defs.type === Date) {
                if (self._doc && name in self._doc) {
                    value = dateToFieldDateString(self._doc[name]);
                } else {
                    value = "";
                }
            } else if (defs.type === Boolean) {
                if (self._doc && name in self._doc) {
                    value = self._doc[name];
                } else {
                    value = false;
                }
            } else {
                if (self._doc && name in self._doc) {
                    value = self._doc[name].toString();
                } else {
                    value = "";
                }
            }
        }

        //required?
        var req = defs.optional ? "" : " required";

        //handle boolean values
        var checked = "", checkedOpposite = "";
        if (defs.type === Boolean && value === "true") {
            checked = " checked";
        } else {
            checkedOpposite = " checked";
        }

        //get type
        var type = "text";
        if (defs.type === String && defs.regEx === SchemaRegEx.Email) {
            type = "email";
        } else if (defs.type === String && defs.regEx === SchemaRegEx.Url) {
            type = "url";
        } else if (defs.type === Number) {
            type = "number";
        } else if (defs.type === Date) {
            type = "date";
        }

        var label = defs.label || name;

        //get correct max/min attributes
        var max = "", min = "";
        if (defs.type === String) {
            if (defs.max) {
                max = ' maxlength="' + defs.max + '"';
            }
        } else {
            //max
            if (hash.max) {
                max = ' max="' + hash.max + '"';
            } else if (defs.max) {
                if (defs.max instanceof Date) {
                    max = ' max="' + dateToFieldDateString(defs.max) + '"';
                } else {
                    max = ' max="' + defs.max + '"';
                }
            }
            //min
            if (hash.min) {
                min = ' min="' + hash.min + '"';
            } else if (defs.min) {
                if (defs.min instanceof Date) {
                    min = ' min="' + defs.min.getUTCFullYear() + '-' + (defs.min.getUTCMonth() + 1) + '-' + defs.min.getUTCDate() + '"';
                } else {
                    min = ' min="' + defs.min + '"';
                }
            }
        }

        //get step value
        var step = "";
        if (hash.step) {
            step = ' step="' + hash.step + '"';
        } else if (defs.decimal) {
            step = ' step="0.01"';
        }

        //clean hash; we're adding these explicitly, so we don't want to have two
        var firstOption, radio, select, trueLabel, falseLabel, selectOptions;
        if ("name" in hash) {
            delete hash.name;
        }
        if ("value" in hash) {
            delete hash.value;
        }
        if ("step" in hash) {
            delete hash.step;
        }
        if ("data-collection-key" in hash) {
            delete hash["data-collection-key"];
        }
        if ("firstOption" in hash) {
            firstOption = hash.firstOption;
            delete hash.firstOption;
        }
        if ("radio" in hash) {
            radio = hash.radio;
            delete hash.radio;
        }
        if ("select" in hash) {
            select = hash.select;
            delete hash.select;
        }
        if ("trueLabel" in hash) {
            trueLabel = hash.trueLabel;
            delete hash.trueLabel;
        }
        if ("falseLabel" in hash) {
            falseLabel = hash.falseLabel;
            delete hash.falseLabel;
        }
        if ("options" in hash) {
            selectOptions = hash.options;
            delete hash.options;
        }

        if (selectOptions) {
            //build anything that should be a select, which is anything with defs.options
            var multiple = "", isMultiple;
            if (_.isArray(defs.type)) {
                multiple = " multiple";
                isMultiple = true;
            }
            html = '<select data-collection-key="' + name + '" name="' + name + '"' + objToAttributes(hash) + req + multiple + '>';
            if (firstOption && !isMultiple) {
                html += '<option value="">' + firstOption + '</option>';
            }
            _.each(selectOptions, function(opt) {
                var selected;
                if (isMultiple) {
                    if (_.contains(value, opt.value)) {
                        selected = ' selected';
                    } else {
                        selected = '';
                    }
                } else {
                    if (opt.value === value) {
                        selected = ' selected';
                    } else {
                        selected = '';
                    }
                }
                html += '<option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
            });
            html += '</select>';
        } else if (defs.type === String && hash.rows) {
            html = '<textarea data-collection-key="' + name + '" name="' + name + '"' + objToAttributes(hash) + req + max + '>' + value + '</textarea>';
        } else if (defs.type === Boolean) {
            if (radio) {
                html = '<label class="radio"><input type="radio" data-collection-key="' + name + '" name="' + name + '" value="true"' + checked + objToAttributes(hash) + req + ' /> ' + trueLabel + '</label>';
                html += '<label class="radio"><input type="radio" data-collection-key="' + name + '" name="' + name + '" value="false"' + checkedOpposite + objToAttributes(hash) + req + ' /> ' + falseLabel + '</label>';
            } else if (select) {
                html = '<select data-collection-key="' + name + '" name="' + name + '"' + objToAttributes(hash) + req + '>';
                html += '<option value="true"' + (value ? ' selected' : '') + '>' + trueLabel + '</option>';
                html += '<option value="false"' + (!value ? ' selected' : '') + '>' + falseLabel + '</option>';
                html += '</select>';
            } else {
                html = '<label for="' + name + '" class="checkbox"><input type="checkbox" data-collection-key="' + name + '" name="' + name + '" value="true"' + checked + objToAttributes(hash) + req + ' /> ' + label + '</label>';
            }
        } else {
            html = '<input type="' + type + '" data-collection-key="' + name + '" name="' + name + '" value="' + value + '"' + objToAttributes(hash) + req + max + min + step + ' />';
        }
        return new Handlebars.SafeString(html);
    });
    Handlebars.registerHelper("afFieldLabel", function(name, options) {
        var label, self = this;
        var obj = self._c2 || self._ss;
        if (!obj) {
            return "";
        }
        var hash = options && options.hash ? options.hash : {};
        var defs = obj.schema(name);
        if (!defs) {
            throw new Error("Invalid field name");
        }

        label = defs.label || name;
        return new Handlebars.SafeString('<label' + objToAttributes(hash) + '>' + label + '</label>');
    });
    Template._autoForm.events({
        'click .insert[type=submit]': function(event, template) {
            event.preventDefault();
            var doc = formValues(template);

            //for inserts, delete any properties that are null, undefined, or empty strings
            doc = cleanNulls(doc);

            var collection2Obj = window[template.data.collection];
            var cb = collection2Obj._callbacks && collection2Obj._callbacks.insert ? collection2Obj._callbacks.insert : null;
            collection2Obj.insert(doc, function(error, result) {
                if (!error) {
                    template.find("form").reset();
                }
                if (cb) {
                    cb(error, result);
                }
            });
        },
        'click .update[type=submit]': function(event, template) {
            event.preventDefault();
            var self = this, doc = formValues(template), nulls, updateObj = {}, docIsEmpty, nullsIsEmpty;

            //for updates, unset any properties that are null, undefined, or empty strings
            nulls = reportNulls(doc);
            doc = cleanNulls(doc);

            docIsEmpty = _.isEmpty(doc);
            nullsIsEmpty = _.isEmpty(nulls);
            if (docIsEmpty && nullsIsEmpty) {
                return;
            }
            if (!docIsEmpty) {
                updateObj.$set = doc;
            }
            if (!nullsIsEmpty) {
                updateObj.$unset = nulls;
            }

            var collection2Obj = window[template.data.collection];
            var cb = collection2Obj._callbacks && collection2Obj._callbacks.update ? collection2Obj._callbacks.update : null;
            collection2Obj.update(self._doc._id, updateObj, function(error) {
                if (cb) {
                    cb(error);
                }
            });
        },
        'click .remove[type=submit]': function(event, template) {
            event.preventDefault();
            var self = this;
            var collection2Obj = window[template.data.collection];
            var cb = collection2Obj._callbacks && collection2Obj._callbacks.remove ? collection2Obj._callbacks.remove : null;
            collection2Obj.remove(self._doc._id, function(error) {
                if (cb) {
                    cb(error);
                }
            });
        },
        'click button[data-meteor-call]': function(event, template) {
            event.preventDefault();
            var doc = formValues(template);

            //for inserts, delete any properties that are null, undefined, or empty strings
            doc = cleanNulls(doc);

            var simpleSchemaObj = window[template.data.schema];
            var method = event.currentTarget.getAttribute("data-meteor-call");
            var cb = simpleSchemaObj._callbacks && simpleSchemaObj._callbacks[method] ? simpleSchemaObj._callbacks[method] : function() {
            };

            if (simpleSchemaObj.validate(doc)) {
                Meteor.call(method, function(error, result) {
                    if (!error) {
                        template.find("form").reset();
                    }
                    cb(error, result);
                });
            }
        }
    });
}

var formValues = function(template) {
    var fields = template.findAll("[data-collection-key]");
    var doc = {};
    _.each(fields, function(field) {
        //TODO handle dates, etc. and do it based on info specified in the schema
        var name = field.getAttribute("data-collection-key");
        var val = field.value;

        //handle checkbox
        if (field.getAttribute("type") === "checkbox") {
            doc[name] = field.checked;
            return;
        }

        //handle radio
        if (field.getAttribute("type") === "radio") {
            if (field.checked) {
                if (val === "true") { //boolean radio
                    doc[name] = true;
                } else if (val === "false") { //boolean radio
                    doc[name] = false;
                } else {
                    doc[name] = val;
                }
            }
            return;
        }

        //handle select
        if (field.tagName.toLowerCase() === "select") {
            if (val === "true") { //boolean select
                doc[name] = true;
            } else if (val === "false") { //boolean select
                doc[name] = false;
            } else if (field.hasAttribute("multiple")) {
                //multiple select, so we want an array value
                doc[name] = getSelectValues(field);
            } else {
                doc[name] = val;
            }
            return;
        }

        //handle number inputs
        if (field.getAttribute("type") === "number") {
            var floatVal = parseFloat(val);
            if (!isNaN(floatVal)) {
                doc[name] = floatVal;
            } else {
                doc[name] = val; //set to string so will fail validation
            }
            return;
        }

        //handle date inputs
        if (field.getAttribute("type") === "date") {
            if (typeof val === "string" && val.length) {
                var datePieces = val.split("-");
                var year = parseInt(datePieces[0], 10);
                var month = parseInt(datePieces[1], 10) - 1;
                var date = parseInt(datePieces[2], 10);
                doc[name] = new Date(Date.UTC(year, month, date));
            } else {
                doc[name] = null;
            }
            return;
        }

        //handle text inputs
        doc[name] = val;
    });
    return doc;
};
var objToAttributes = function(obj) {
    if (!obj) {
        return "";
    }
    var a = "";
    _.each(obj, function(value, key) {
        a += ' ' + key + '="' + value + '"';
    });
    return a;
};
var cleanNulls = function(doc) {
    var newDoc = {};
    _.each(doc, function(val, key) {
        if (val !== void 0 && val !== null && !(typeof val === "string" && val.length === 0)) {
            newDoc[key] = val;
        }
    });
    return newDoc;
};
var reportNulls = function(doc) {
    var nulls = {};
    _.each(doc, function(val, key) {
        if (val === void 0 || val === null || (typeof val === "string" && val.length === 0)) {
            nulls[key] = "";
        }
    });
    return nulls;
};
var dateToFieldDateString = function(date) {
    var m = (date.getUTCMonth() + 1);
    if (m < 10) {
        m = "0" + m;
    }
    var d = date.getUTCDate();
    if (d < 10) {
        d = "0" + d;
    }
    return date.getUTCFullYear() + '-' + m + '-' + d;
};
var getSelectValues = function(select) {
    var result = [];
    var options = select && select.options;
    var opt;

    for (var i = 0, iLen = options.length; i < iLen; i++) {
        opt = options[i];

        if (opt.selected) {
            result.push(opt.value || opt.text);
        }
    }
    return result;
};