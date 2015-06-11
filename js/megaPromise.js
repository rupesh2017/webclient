/**
 * Mega Promise
 *
 * Polyfill + easier to debug variant of Promises which are currently implemented in some of the cutting edge browsers.
 *
 * The main goals of using this, instead of directly using native Promises are:
 * - stack traces
 * - .done, .fail
 * - all js exceptions will be logged (in the console) and thrown as expected
 *
 * Note: for now, we will use $.Deferred to get this functionality out of the box and MegaPromise will act as a bridge
 * between the original Promise API and jQuery's Deferred APIs.
 *
 * Implementation note: .progress is currently not implemented.
 */


/**
 * Mega Promise constructor
 *
 * @returns {MegaPromise}
 * @constructor
 */
function MegaPromise(fn) {
    var self = this;

    self._internalPromise = new $.Deferred();

    if (fn) {
        fn(
            function() {
                self.resolve.apply(self, toArray(arguments));
            },
            function() {
                self.reject.apply(self, toArray(arguments));
            }
        );
    }
    return this;
};

if (typeof(Promise) !== "undefined") {
    MegaPromise._origPromise = Promise;
} else {
    MegaPromise._origPromise = undefined;
    window.Promise = MegaPromise;
}

/**
 * Convert Native and jQuery promises to MegaPromises, by creating a MegaPromise proxy which will be attached
 * to the actual underlying promise's .then callbacks.
 *
 * @param p
 * @returns {MegaPromise}
 * @private
 */
MegaPromise.asMegaPromiseProxy  = function(p) {
    var $promise = new MegaPromise();

    p.then(function() {
        $promise.resolve.apply($promise, toArray(arguments))
    }, MegaPromise.getTraceableReject($promise, p));

    return $promise;
};

/**
 * Common function to be used as reject callback to promises.
 *
 * @param promise {MegaPromise}
 * @returns {function}
 * @private
 */
MegaPromise.getTraceableReject = function($promise, origPromise) {
    return function(argument) {
        if (window.d) {
            var stack;
            // try to get the stack trace
            try {
                throw new Error("DEBUG");
            } catch(e) {
                stack = e.stack;
            }
            console.error("Promise rejected: ", argument, origPromise, stack);
        }
        try {
            if (typeof $promise === 'function') {
                $promise.apply(origPromise, arguments);
            }
            else {
                $promise.reject.apply($promise, toArray(arguments))
            }
        }
        catch (e) {
            console.error('Unexpected promise error: ', e);
        }
    };
};

/**
 * By implementing this method, MegaPromise will be compatible with .when/.all syntax.
 *
 * jQuery: https://github.com/jquery/jquery/blob/10399ddcf8a239acc27bdec9231b996b178224d3/src/deferred.js#L133
 *
 * @returns {jQuery.Deferred}
 */
MegaPromise.prototype.promise = function() {
    return this._internalPromise.promise();
};

/**
 * Alias of .then
 *
 * @param res
 *     Function to be called on resolution of the promise.
 * @param [rej]
 *     Function to be called on rejection of the promise.
 * @returns {MegaPromise}
 */
MegaPromise.prototype.then = function(res, rej) {

    return MegaPromise.asMegaPromiseProxy(this._internalPromise.then(res, rej));
};

/**
 * Alias of .done
 *
 * @param res
 * @param [rej]
 * @returns {MegaPromise}
 */
MegaPromise.prototype.done = function(res, rej) {
    this._internalPromise.done(res, rej);
    return this;
};

/**
 * Alias of .state
 *
 * @returns {String}
 */
MegaPromise.prototype.state = function() {
    return this._internalPromise.state();
};

/**
 * Alias of .fail
 *
 * @param rej
 * @returns {MegaPromise}
 */
MegaPromise.prototype.fail = function(rej) {
    this._internalPromise.fail(rej);
    return this;
};


/**
 * Intentionally we'd added this method to throw an exception, since we don't want anyone
 * using it.
 *
 * @throws {Error}
 */
MegaPromise.prototype.catch = function() {
    throw new Error('.catch is prohibited in MegaPromises.');
};

/**
 * Alias of .resolve
 *
 * @returns {MegaPromise}
 */
MegaPromise.prototype.resolve = function() {
    this._internalPromise.resolve.apply(this._internalPromise, toArray(arguments));
    return this;
};

/**
 * Alias of .reject
 *
 * @returns {MegaPromise}
 */
MegaPromise.prototype.reject = function() {
    this._internalPromise.reject.apply(this._internalPromise, toArray(arguments));
    return this;
};

/**
 * Alias of .always
 *
 * @returns {MegaPromise}
 */
MegaPromise.prototype.always = function() {
    this._internalPromise.always.apply(this._internalPromise, toArray(arguments));
    return this;
};

/**
 * Link the `targetPromise`'s state to the current promise. E.g. when targetPromise get resolved, the current promise
 * will get resolved too with the same arguments passed to targetPromise.
 *
 * PS: This is a simple DSL-like helper to save us from duplicating code when using promises :)
 *
 * @param targetPromise
 * @returns {MegaPromise} current promise, helpful for js call chaining
 */
MegaPromise.prototype.linkDoneTo = function(targetPromise) {
    var self = this;
    targetPromise.done(function() {
        self.resolve.apply(self, arguments);
    });

    return self;
};

/**
 * Link the `targetPromise`'s state to the current promise. E.g. when targetPromise get rejected, the current promise
 * will get rejected too with the same arguments passed to targetPromise.
 * PS: This is a simple DSL-like helper to save us from duplicating code when using promises :)
 *
 *
 * @param targetPromise
 * @returns {MegaPromise} current promise, helpful for js call chaining
 */
MegaPromise.prototype.linkFailTo = function(targetPromise) {
    var self = this;
    targetPromise.fail(function() {
        self.reject.apply(self, arguments);
    });

    return self;
};
/**
 * Link the `targetPromise`'s state to the current promise (both done and fail, see .linkDoneTo and .linkFailTo)
 *
 * PS: This is a simple DSL-like helper to save us from duplicating code when using promises :)
 *
 * @param targetPromise
 * @returns {MegaPromise} current promise, helpful for js call chaining
 */
MegaPromise.prototype.linkDoneAndFailTo = function(targetPromise) {
    var self = this;

    self.linkDoneTo(targetPromise);
    self.linkFailTo(targetPromise);

    return self;
};

/**
 * Development helper, that will dump the result/state change of this promise to the console
 *
 * @param [msg] {String} optional msg
 * @returns {MegaPromise} current promise, helpful for js call chaining
 */
MegaPromise.prototype.dumpToConsole = function(msg) {
    var self = this;

    if (d) {
        self.done(function () {
            console.log("success: ", msg ? msg : arguments, !msg ? null : arguments);
        });
        self.fail(function () {
            console.error("error: ", msg ? msg : arguments, !msg ? null : arguments);
        });
    }

    return self;
};

/**
 * Implementation of Promise.all/$.when, with a little bit more flexible way of handling different type of promises
 * passed in the `promisesList`
 *
 * @returns {MegaPromise}
 */
MegaPromise.all = function(promisesList) {

    var _jQueryPromisesList = [];
    promisesList.forEach(function(v, k) {
        if (MegaPromise._origPromise && v instanceof MegaPromise._origPromise) {
            v = MegaPromise.asMegaPromiseProxy(v);
        }
        _jQueryPromisesList.push(v);
    });

    // return MegaPromise.asMegaPromiseProxy(
        // $.when.apply($, _jQueryPromisesList)
    // );

    var promise = new MegaPromise();

    $.when.apply($, _jQueryPromisesList)
        .then(function() {
            promise.resolve(toArray(arguments));
        }, MegaPromise.getTraceableReject(promise));

    return promise;
};

/**
 * Implementation of Promise.all/$.when, with a little bit more flexible way of handling different type of promises
 * passed in the `promisesList`
 *
 * @param promisesList {Array}
 * @param [timeout] {Integer} max ms to way for the master promise to be resolved before rejecting it
 * @returns {MegaPromise}
 */
MegaPromise.allDone = function(promisesList, timeout) {

    var totalLeft = promisesList.length;
    var results = [];
    var masterPromise = new MegaPromise();
    var alwaysCb = function() {
        totalLeft--;
        results.push(arguments);

        if (totalLeft === 0) {
            masterPromise.resolve(results);
        }
    };


    var _megaPromisesList = [];
    promisesList.forEach(function(v, k) {
        if (MegaPromise._origPromise && v instanceof MegaPromise._origPromise) {
            v = MegaPromise.asMegaPromiseProxy(v);
        }
        _megaPromisesList.push(v);
        v.done(alwaysCb);
        v.fail(alwaysCb);
    });

    if (timeout) {
        var timeoutTimer = setTimeout(function () {
            masterPromise.reject(results);
        }, timeout);

        masterPromise.always(function () {
            clearTimeout(timeoutTimer);
        });
    }


    return masterPromise;
};

/**
 * alias of Promise.resolve, will create a new promise, resolved with the arguments passed to this method
 *
 * @returns {MegaPromise}
 */
MegaPromise.resolve = function() {
    var p = new MegaPromise();
    p.resolve.apply(p, toArray(arguments));

    return p;
};


/**
 * alias of Promise.reject, will create a new promise, rejected with the arguments passed to this method
 *
 * @returns {MegaPromise}
 */
MegaPromise.reject = function() {
    var p = new MegaPromise();
    p.reject.apply(p, toArray(arguments));

    return p;
};
