  // global S and P are accessible anywhere, and all files are merged into one on build.
  // NOTE it IS possible for scripts to persist between cloudflare worker requests, but also not guaranteed or intentional
  // so can't rely on them being clean every time, nor rely on them for storing state. Hence every new fetch event builds its own @S and @P
var P, S, SS, k,
  indexOf = [].indexOf;

try {
  // from CF variable this will need parsed, so just default to passing them as strings and parsing them
  S = JSON.parse(SECRETS_SETTINGS);
} catch (error) {}

try {
  SS = JSON.parse(SECRETS_SERVER); // backend server can provide overrides in a server.json secrets file
  for (k in SS) {
    S[k] = SS[k];
  }
} catch (error) {}

if (S == null) {
  S = {};
}

if (S.name == null) {
  S.name = 'Paradigm'; // this will also be used as the default name for the KV store
}

if (S.version == null) {
  S.version = '5.3.1'; // the construct script will use this to overwrite any version in the worker and server package.json files
}

if (S.dev == null) {
  S.dev = true;
}

if (typeof S.bg === 'string') { // if there is a bg to pass through to on errors/timeouts, then go to it by default
  if (S.pass == null) {
    S.pass = true;
  }
}

if (S.docs == null) {
  S.docs = 'https://leviathanindustries.com/paradigm';
}

if (S.headers == null) {
  S.headers = {
    'Access-Control-Allow-Methods': 'HEAD, GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-apikey, X-id, Origin, X-Requested-With, Content-Type, Content-Disposition, Accept, DNT, Keep-Alive, User-Agent, If-Modified-Since, Cache-Control',
    'Permissions-Policy': 'interest-cohort=()'
  };
}

if (S.formats == null) {
  S.formats = [
    'html',
    'csv',
    'json' // allow formatted responses in this list
  ];
}

if (S.svc == null) {
  S.svc = {};
}

if (S.src == null) {
  S.src = {};
}

try {
  // check _auth, refuse if not appropriate
  // _auth - if true an authorised user is required. If a string or a list, an authorised user with that role is required. For empty list, cascade the url routes as groups. always try to find user even if auth is not required, so that user is optionally available

  // check cache unless _cache is false, set res from cache if matches
  // _cache - can be false or a number of seconds for how long the cache value is valid) (pass refresh param with incoming request to override a cache)
  // NOTE _auth and _cache are ALWAYS checked first at the incoming request level, and NOT checked for subsequent called functions (fetch can also use cache internally)

  // if an _async param was provided, check the async index for a completed result
  // if found, delete it and save it to wherever it should be (if anywhere), just as if a normal result had been processed
  // return the result to the user (via usual caching, logging etc if appropriate)

  // otherwise check for args and/or params
  // if args has length, args have priority
  // otherwise go with params (or just pass through?)

  // then check storage layers if configured to do so
  // _kv - if true store the result in CF workers KV, and check for it on new requests - like a cache, but global, with 1s eventual consistency whereas cache is regional
  // _index - if true send the result to an index. Or can be an object of index initialisation settings, mappings, aliases
  // _key - optional which key, if not default _id, to use from a result object to save it as - along with the function route which will be derived if not provided
  // _search - if false, the wrapper won't run a search on incoming potential queries before calling the function. If a string, will be used as the key to search within, unless the incoming content is obviously already a complex query
  // _qopts - an optional object defining query options, see P.index.translate and elasticsearch docs to learn more about what can be provided
  // _prefix - if false, the index is not prefixed with the app/index name, so can be accessed by any running version. Otherwise, an index is only accessible to the app version with the matching prefix. TODO this may be updated with abilityt o list prefix names to match multiple app versions but not all
  // _sheet - if true get a sheet ID from settings for the given endpoint, if string then it is the sheet ID. If present it implies _index:true if _index is not set

  // _kv gets checked prior to _index UNLESS there are args that appear to be a query
  // for _kv, args[0] has to be a string for a key, with no args[1] - otherwise pass through
  // for _index args[0] has to be string for key, or query str or query obj, args[1] empty or query params
  // if it was a call to /index directly, and if those get wrapped, then args[0] may also be index name, with a query obj in args[1]
  // if _index and no index present, create it - or only on provision of data or query?
  // if _sheet, and no index present, or @params.sheet, load it too
  // _sheet loads should be _bg even if main function isn't
  // if _sheet, block anything appearing to be a write?

  // _async - if true, don't wait for the result, just return _async:@rid. If bg is configured and _bg isn't false on the function, send to bg. Otherwise just continue it locally.
  // _bg - if true pass request to backend server e.g for things that are known will be long running
  // this can happen at the top level route or if it calls any function that falls back to bg, the whole query falls back

  // by this point, with nothing else available, run the process (by now either on bg or worker, whichever was appropriate)

  // if the response indicates an error, e.g. it is an object with a status: 404 or similar, return to the response
  // also do not save if a Response object is directly passed as result from the function (and don't send to _response either, just return it)

  // if a valid result is available, and wasn't already a record in from kv or index, write the result to kv/index if configured to do so
  // NOTE index actually writes to kv unless _kv is explicitly false, for later scheduled pickup and bulk index
  // otherwise result needs to have a _key or _id
  // cache the result unless _cache is false or it was an index creation or sheet load

  // log the request, and whether or not data was sent, and if a result was achieved, and other useful info
  // if _history, and new data was sent, store the POST content rather than just whether or not there was any, so it can be recreated

  // _diff can be true or a list of arguments for the function. It will check to see if a process gives the same result 
  // (compared against a previously stored one). If it doesn't it should log something that then gets 
  // picked up by the alert mechanism

  // _format can be set to default the function format return type (html or csv so far)
  // _hidden can be set to hide a function that should otherwise show up on the routes list, 
  // e.g. one that doesn't start with _ but should be hidden for some reason anyway. NOTE this 
  // doesn't stop it being ACCESSIBLE on the API, only hidden, whereas starting it with _ makes it inaccessible

  // TODO limit, retry, cron/job/batch (note workers now has a schedule ability too. explore that but consider vendor lock-in)
  // TODO add a way for a function to result in a file url on local disk or s3, or perhaps even a URL somewhere else, 
  // and to serve the location redirect as the result. Could be a _file option
  addEventListener('fetch', function(event) {
    if (S.pass) {
      event.passThroughOnException();
    }
    return event.respondWith(P.call(event));
  });
} catch (error) {}

try {
  addEventListener('scheduled', function(event) {
    // https://developers.cloudflare.com/workers/runtime-apis/scheduled-event
    // event.type will always be 'scheduled'. event.scheduledTime ms timestamp of the scheduled time. Can be parsed with new Date(event.scheduledTime)
    return event.waitUntil(P.call(event, true)); // Fails will be recorded on Cron past events UI. Otherwise will record as success
  });
} catch (error) {}

P = async function(scheduled) {
  var _lp, _return, _save, authd, base, base1, base2, ct, d, entry, fd, fn, fs, fun, hd, hhmm, hk, i, j, klogs, kp, kpn, last, lasts, len, len1, len2, m, name, pf, pk, prs, qp, recs, ref, ref1, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, requested_refresh, res, resp, schedule;
  // the context here is the fetch event
  this.started = Date.now(); // not strictly accurate in a workers environment, but handy nevertheless, used for comparison when logs are finally written
  try {
    
    // make @S settings object local to this fetch event
    // this header is defined later because the built date is added to the end of the file by the deploy script, so it's not known until now
    if ((base = S.headers)[name = 'X-' + S.name] == null) {
      base[name] = (S.version ? 'v' + S.version : '') + (S.built ? ' built ' + S.built : '');
    }
  } catch (error) {}
  this.S = JSON.parse(JSON.stringify(S));
  
  // make @params @body, @headers, @cookie
  this.params = {}; // TODO add a general cleaner of incoming params? but allow override if necessary for certain endpoints?
  // note may need to remove apikey param - but if removing, how does that affect the fact that request is an actual immutable Request object?
  // it probably would appear to change, but may still be in there, then may get saved in cache etc which prob isn't wanted
  // unless results SHOULD differ by apikey? Probably on any route where that is the case, caching should be disabled
  if ((this.request.url != null) && this.request.url.indexOf('?') !== -1) {
    ref = this.request.url.split('?')[1].split('&');
    for (i = 0, len = ref.length; i < len; i++) {
      qp = ref[i];
      kp = qp.split('=');
      this.params[kp[0]] = kp.length === 1 ? true : typeof kp[1] === 'string' && kp[1].toLowerCase() === 'true' ? true : typeof kp[1] === 'string' && kp[1].toLowerCase() === 'false' ? false : qp.endsWith('=') ? true : kp[1];
      if (typeof this.params[kp[0]] === 'string' && this.params[kp[0]].replace(/[0-9]/g, '').length === 0 && !this.params[kp[0]].startsWith('0')) {
        kpn = parseInt(this.params[kp[0]]);
        if (!isNaN(kpn)) {
          this.params[kp[0]] = kpn;
        }
      }
      if (typeof this.params[kp[0]] === 'string' && (this.params[kp[0]].startsWith('[') || this.params[kp[0]].startsWith('{'))) {
        try {
          this.params[kp[0]] = JSON.parse(this.params[kp[0]]);
        } catch (error) {}
      } else if (typeof this.params[kp[0]] === 'string' && this.params[kp[0]].indexOf('%') !== -1) {
        try {
          this.params[kp[0]] = decodeURIComponent(this.params[kp[0]]);
        } catch (error) {}
      }
    }
  }
  this.headers = {};
  try {
    ref1 = [...this.request.headers];
    // request headers is an immutable Headers instance, not a normal object, so would appear empty unless using get/set, so parse it out here
    for (j = 0, len1 = ref1.length; j < len1; j++) {
      hd = ref1[j];
      this.headers[hd[0].toLowerCase()] = hd[1];
    }
  } catch (error) {
    try {
    // backend server passes a normal object, so just use that if not set above
      for (hk in this.request.headers) {
        this.headers[hk.toLowerCase()] = this.request.headers[hk];
      }
    } catch (error) {}
  }
  try {
    ct = this.headers['content-type'];
    if (ct == null) {
      ct = '';
    }
    if (ct.includes('/json')) {
      this.body = (await this.request.json());
    } else if (ct.includes('form')) {
      fd = (await this.request.formData());
      for (entry in fd.entries()) {
        if (this.body[entry[0]] != null) {
          if (!Array.isArray(this.body[entry[0]])) {
            this.body[entry[0]] = [this.body[entry[0]]];
          }
          this.body[entry[0]].push(entry[1]);
        } else {
          this.body[entry[0]] = entry[1];
        }
      }
    } else {
      this.body = (await this.request.text());
    }
  } catch (error) {}
  try {
    // and what if blob? Accept blobs or not?
    // @body = URL.createObjectURL await request.blob()
    if (this.body == null) {
      this.body = this.request.body; // if nothing else, just get the body which may be directly provided by the server
    }
  } catch (error) {}
  try {
    if (this.body.startsWith('{') || this.body.startsWith('[')) {
      this.body = JSON.parse(this.body);
    }
  } catch (error) {}
  try {
    if (typeof this.body === 'object' && !Array.isArray(this.body)) {
      for (qp in this.body) {
        if ((base1 = this.params)[qp] == null) {
          base1[qp] = this.body[qp];
        }
      }
    }
  } catch (error) {}
  if (typeof this.waitUntil !== 'function') { // it will be on worker, but not on backend
    if ((this.S.bg == null) || typeof this.S.bg === 'string') { // or could there be other places there is no waitUntil, but we want to deploy there without it being in bg mode?
      this.S.bg = true;
    }
    if ((base2 = this.S).cache == null) {
      base2.cache = false;
    }
    this.waitUntil = function(fn) {
      return true; // just let it run
    };
  } else if (!this.S.kv) { // try setting a default key-value store reference on the worker
    // where will backend overwrite this to true? can this be set on the global S, and overwritten on backend?
    this.S.kv = this.S.name.replace(/\s/g, '');
    if (!global[this.S.kv]) {
      delete this.S.kv;
    }
  }
  try {
    this.cookie = (ref2 = this.headers.Cookie) != null ? ref2 : this.headers.cookie;
  } catch (error) {}
  try {
    
    // set some request and user IDs / keys in @rid, @id, @apikey, and @refresh
    this.rid = this.headers['cf-ray'].slice(0, -4);
  } catch (error) {}
  try {
    if (this.rid == null) {
      this.rid = this.headers['x-' + this.S.name + '-async'];
    }
  } catch (error) {}
  try {
    // how / when to remove various auth headers before logging / matching cache?
    // e.g apikey, id, resume, token, access_token, email?
    this.uid = (ref3 = (ref4 = this.headers['x-uid']) != null ? ref4 : this.headers.uid) != null ? ref3 : this.params.uid;
  } catch (error) {}
  try {
    this.apikey = (ref5 = (ref6 = this.headers['x-apikey']) != null ? ref6 : this.headers.apikey) != null ? ref5 : this.params.apikey;
  } catch (error) {}
  if (this.headers['x-apikey']) {
    delete this.headers['x-apikey'];
  }
  if (this.headers.apikey) {
    delete this.headers.apikey;
  }
  if (this.params.apikey) {
    delete this.params.apikey;
  }
  if (this.params.uid) {
    delete this.params.uid;
  }
  if (this.params.refresh) {
    this.refresh = this.params.refresh;
    delete this.params.refresh; // what to do about refresh getting into the cache key?
  }
  
  // set the @url, the @base, the @route, and the url route parts in @parts
  if (this.request.url.indexOf('http://') !== 0 && this.request.url.indexOf('https://') !== 0) {
    // in case there's a url param with them as well, check if they're at the start
    // there's no base to the URL passed on the backend server, so here the @base isn't shifted from the parts list
    this.url = this.request.url.split('?')[0].replace(/^\//, '').replace(/\/$/, '');
    this.parts = this.url.length ? this.url.split('/') : [];
    try {
      this.base = this.headers.host;
    } catch (error) {}
  } else {
    this.url = this.request.url.split('?')[0].replace(/\/$/, '').split('://')[1];
    this.parts = this.url.split('/');
    this.base = this.parts.shift();
  }
  if (typeof this.headers.accept === 'string') {
    if (this.headers.accept.indexOf('/csv') !== -1 && indexOf.call(this.S.formats, 'csv') >= 0) {
      this.format = 'csv';
    }
  }
  if (this.parts.length && this.parts[this.parts.length - 1].indexOf('.') !== -1) { // format specified in url takes precedence over header
    pf = this.parts[this.parts.length - 1].split('.').pop();
    if (indexOf.call(this.S.formats, pf) >= 0) {
      this.format = pf;
      this.parts[this.parts.length - 1] = this.parts[this.parts.length - 1].replace('.' + pf, '');
    }
  }
  if (this.parts.length === 1 && ((ref7 = this.parts[0]) === 'docs' || ref7 === 'client') && typeof this.S.bg === 'string' && this.S.pass) {
    throw new Error(); // send to backend to handle requests for anything that should be served from folders on disk
  }
  for (d in (ref8 = this.S.domains) != null ? ref8 : {}) {
    if (this.base.indexOf(d) !== -1) {
      this.domain = d;
      this.parts = [...this.S.domains[d], ...this.parts];
      break;
    }
  }
  if (this.S.dev && this.S.bg === true) {
    console.log(this.base, this.domain);
  }
  this.route = this.parts.join('/');
  this.routes = [];
  this.fn = ''; // the function name that was mapped to by the URL routes in the request will be stored here
  if (scheduled || this.route === '_schedule') { // and restrict this to root, or disable URL route to it
    this.scheduled = true;
  }
  //@nolog = true if ... # don't log if nolog is present and its value matches a secret key? Or if @S.log is false?
  this._logs = []; // place for a running request to dump multiple logs, which will combine and save at the end of the overall request
  if (this.route === '') { //don't bother doing anything, just serve a direct P._response with the API details
    return P._response.call(this, (ref9 = this.request.method) === 'HEAD' || ref9 === 'OPTIONS' ? '' : {
      name: this.S.name,
      version: this.S.version,
      base: (this.S.dev ? this.base : void 0),
      built: (this.S.dev ? this.S.built : void 0)
    });
  }
  // a save method called by the following _return when necessary
  _save = async(k, r, f) => {
    var c, exists, id, len2, m, ref10, ref11;
    if ((r != null) && (typeof r !== 'object' || Array.isArray(r) || (((ref10 = r.headers) != null ? ref10.append : void 0) !== 'function' && (typeof r.status !== 'number' || r.status < 200 || r.status > 600)))) {
      // if the function returned a Response object, or something with an error status, don't save it
      if (f._key && Array.isArray(r) && r.length && (r[0]._id == null) && (r[0][f._key] != null)) {
        for (m = 0, len2 = r.length; m < len2; m++) {
          c = r[m];
          c._id = (Array.isArray(c[f._key]) ? c[f._key][0] : c[f._key]);
        }
      }
      id = Array.isArray(r) ? '' : '/' + (f._key && r[f._key] ? r[f._key] : (ref11 = r._id) != null ? ref11 : this.uid()).replace(/\//g, '_').replace(k + '_', '').toLowerCase();
      if (f._kv && !Array.isArray(r)) { //_kv should be set for things that MUST be in the kv - they won't be removed, but will be copied to index if _index is also true
        this.kv(k + id, r, f._kv);
      }
      if (f._index && (f._kv === false || !this.S.kv || this.S.bg)) { // all indexing is bulked through kv unless _kv is false or overall kv is disabled in settings, or immediate indexing is true
        if (!(exists = (await this.index(k.split('/')[0])))) {
          await this.index(k.split('/')[0], (typeof f._index !== 'object' ? {} : {
            settings: f._index.settings,
            mappings: f._index.mappings,
            aliases: f._index.aliases
          }));
        }
        this.index(k + id, r);
      }
      if (f._async) {
        return this.kv('async/' + this.rid, f._index || f._kv ? k + id : r);
      }
    }
  };
  // wraps every function on P, apart from top level functions and ones that start with _
  // and controls how it should return, depending on wrapper settings declared on each P object
  // _auth and _cache are handled before _return is used to wrap, because they only operate on the function defined by the URL route
  // whereas any other functon called later also gets wrapped and handled here
  _return = (f, n) => {
    var _wrapped, fs, uf, uk, wb;
    try {
      fs = P.dot(this.S, n);
      for (uf in fs) {
        if (uf.startsWith('_')) { // try to find anything in settings and treat it as an override
          f[uf] = fs[uf];
        }
      }
    } catch (error) {}
    if (Array.isArray(f._auth) && f._auth.length === 0) { // an empty auth array defaults to group names corresponding to the function subroutes
      f._auth = n.split('.');
    }
    if (f._sheet) {
      if (f._index == null) {
        f._index = true;
      }
    }
    if (n.startsWith('auth')) {
      if (f._cache == null) {
        f._cache = false;
      }
    }
    if (f._index && f._kv !== false) {
      if (f._schedule == null) {
        f._schedule = (f._sheet ? '0001' : true); // reload sheets at 0600 every day by default?
      }
    }
    if (typeof f === 'function' && (n.indexOf('.') === -1 || n.split('.').pop().indexOf('_') === 0)) {
      return f.bind(this); // don't wrap top-level or underscored methods
    } else if (typeof f === 'object' && !f._index && !f._kv && !f._bg && typeof f[this.request.method] !== 'function') {
      f._fn = n;
      return JSON.parse(JSON.stringify(f));
    } else {
      _wrapped = async function() {
        var _async, adone, bup, c, di, dr, exists, isq, len2, len3, len4, lg, m, o, q, qopts, rec, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref18, ref19, ref20, res, rt, st;
        st = Date.now(); // again, not necessarily going to be accurate in a workers environment
        rt = n.replace(/\./g, '_');
        lg = {
          fn: n,
          key: rt
        };
        if (f._async && this.params.async && !arguments.length && this.fn === n) {
          // check for an _async param request and look to see if it is in the async temp store (if it's finished)
          if (adone = (await this.kv('async/' + this.params.async, ''))) {
            if (typeof adone === 'string' && adone.indexOf('/') !== -1 && adone.split('/').length === 2) {
              if (f._kv) { // retrieve the full result from kv or index (the async just stored the identifier for it)
                res = (await this.kv(adone));
              } else if (f._index) {
                res = (await this.index(adone));
              }
            } else {
              try {
                res = typeof adone === 'string' ? JSON.parse(adone) : adone;
              } catch (error) {
                res = adone;
              }
            }
          } else {
            res = {
              _async: this.params.async // user should keep waiting
            };
          }
        } else if (f._index || f._kv) {
          if (arguments.length === 1) {
            if (f._index && (await this.index._q(arguments[0]))) {
              lg.qry = arguments[0];
            } else if (typeof arguments[0] === 'string') {
              if (arguments[0].length) {
                //lg.key = rt + '/' + arguments[0].replace(/\//g, '_').replace rt + '_', ''
                lg.key = arguments[0];
              } else {
                rec = '';
              }
            } else if (typeof arguments[0] === 'object') {
              rec = arguments[0];
              lg.key = f._key ? rec[f._key] : rec._id ? rec._id : rt;
            }
          } else if (arguments.length === 2) {
            if (f._index && (arguments[0] != null) && (isq = (await this.index._q(arguments[0])))) {
              lg.qry = arguments[0];
              qopts = arguments[1];
            } else if (f._index && typeof arguments[0] === 'string' && arguments[0].indexOf('/') === -1 && (isq = (await this.index._q(arguments[1])))) {
              lg.key = arguments[0];
              lg.qry = arguments[1];
            } else if (typeof arguments[0] === 'string') {
              lg.key = arguments[0];
              rec = arguments[1];
              if (lg.key.indexOf('/') === -1) {
                lg.key = f._key && rec[f._key] ? rec[f._key] : rec._id ? rec._id : rt;
              }
            }
          } else if (this.fn === n) { // try from params and parts - it's only a rec if the parts indicate an ID as well as route
            if (this.request.method === 'PUT' || (this.request.method === 'POST' && !(isq = (await this.index._q(this.params))))) {
              rec = this.body;
            } else if (this.request.method === 'DELETE') {
              rec = '';
            } else if (isq = (await this.index._q(this.params))) {
              lg.qry = this.params;
            } else if (this.parts.indexOf('create') === this.parts.length - 1 || this.parts.indexOf('save') === this.parts.length - 1) {
              rec = this.copy(this.params);
              ref10 = this.parts;
              for (m = 0, len2 = ref10.length; m < len2; m++) {
                c = ref10[m];
                delete rec[c];
              }
              if (JSON.stringify(rec) === '{}') {
                rec = void 0;
              }
            }
            lg.key = this.route;
          }
        }
        if (f._sheet && this.parts.indexOf('sheet') === this.parts.length - 1) {
          // serve the sheet url. TODO could make this a redirect too - als make it handle sheet and sheet ID in cases where both are provided
          res = {
            status: 302
          };
          if (this.format === 'json') {
            res.body = 'https://spreadsheets.google.com/feeds/list/' + f._sheet + '/' + 'default' + '/public/values?alt=json';
          } else {
            res.body = 'https://docs.google.com/spreadsheets/d/' + f._sheet;
          }
          res.headers = {
            Location: res.body
          };
        }
        if (lg.key) {
          lg.key = rt + '/' + lg.key.replace(/\//g, '_').replace(rt, '').replace(/^_/, '');
        }
        if ((res == null) && (f._index || f._kv) && (!this.refresh || (f._sheet && this.fn !== n && !this.scheduled) || (this.fn === n && rec))) { // and not rec? and not fn.qry))
          if (f._kv && lg.key.indexOf('/') !== -1 && !lg.qry) { // check kv first if there is an ID present
            res = (await this.kv(lg.key, rec));
            if ((res != null) && (rec == null)) {
              lg.cached = 'kv';
            }
          }
          if ((res == null) && f._index && ((rec != null) || f._search !== false)) { // otherwise try the index
            // TODO if lg.qry is a string like a title, with no other search qualifiers in it, and f._search is a string, treat f._search as the key name to search in
            // BUT if there are no spaces in lg.qry, it's probably supposed to be part of the key - that should be handled above anyway
            if (rec != null) {
              if (typeof rec === 'object' && !Array.isArray(rec) && !rec._id && ((ref11 = JSON.stringify(rec)) !== '{}' && ref11 !== '[]')) {
                rec._id = this.uid();
              }
              res = (await this.index(lg.key, rec));
            } else {
              if (!lg.key.includes('/')) {
                qopts = (ref12 = (ref13 = (ref14 = f['_' + this.format]) != null ? ref14._qopts : void 0) != null ? ref13 : (ref15 = f._json) != null ? ref15._qopts : void 0) != null ? ref12 : f._qopts;
                if ((lg.qry == null) && (qopts != null)) {
                  lg.qry = '*';
                }
              }
              res = (await this.index(lg.key, (lg.qry ? (await this.index.translate(lg.qry, qopts)) : void 0)));
            }
            if (this.fn !== n && typeof lg.qry === 'string' && lg.qry.indexOf(' ') === -1 && !rec && (res != null ? (ref16 = res.hits) != null ? ref16.total : void 0 : void 0) === 1 && lg.qry.indexOf(res.hits.hits[0]._id) !== -1) {
              try {
                res = res.hits.hits[0]._source;
              } catch (error) {}
            }
            if ((res != null) && (rec == null)) {
              lg.cached = 'index';
            }
          }
        }
        if (lg.cached && this.fn.startsWith(n)) { // record whether or not the main function result was cached in index or kv
          this.cached = lg.cached;
        }
        if ((res == null) && (f._bg || f._sheet) && typeof this.S.bg === 'string' && this.S.bg.indexOf('http') === 0) {
          // if nothing yet and requires bg or sheet, pass to bg if available and not yet there
          // TODO would it be better to just throw error here and divert the entire request to backend?
          bup = {
            headers: {},
            body: rec != null ? rec : (arguments.length ? arguments[0] : this.params)
          };
          bup.headers['x-' + this.S.name + '-async'] = this.rid;
          try {
            // TODO could @_timeout this and if it runs out, throw new Error() to go to bg machine
            // TODO this replace of _ with / affects function names with underscores in them - if there are any, need a neater way to handle switching back to url form
            res = (await this.fetch(this.S.bg + '/' + lg.key.replace(/_/g, '/') + (this.refresh ? '?refresh=true' : ''), bup)); // if this takes too long the whole route function will timeout and cascade to bg
            lg.bg = true;
          } catch (error) {}
        }
        // if it's an index function with a sheet setting, or a sheet param has been provided, what to do by default?
        if ((res == null) && f._sheet && (this.refresh || !(exists = (await this.index(rt))))) { // this will happen on background where possible, because above will have routed to bg if it was available
          res = (await this.src.google.sheets(f._sheet));
          if (typeof f === 'function') { // process the sheet with the parent if it is a function
            res = (await f.apply(this, [res]));
          }
          if (Array.isArray(res) && res.length) {
            await this.index(rt, '');
          }
          this.waitUntil(_save(rt, this.copy(res), f));
          res = res.length;
        }
        if (res == null) {
          if (typeof ((ref17 = f[this.request.method]) != null ? ref17 : f) === 'function') { // it could also be an index or kv config object with no default function
            if (f._async) {
              lg.async = true;
              res = {
                _async: this.rid
              };
              _async = async(rt, f) => {
                var ares, ref18;
                if (ares = (await ((ref18 = f[this.request.method]) != null ? ref18 : f).apply(this, arguments))) {
                  return _save(rt, this.copy(ares), f);
                }
              };
              this.waitUntil(_async(rt, f));
            } else {
              res = (await ((ref18 = f[this.request.method]) != null ? ref18 : f).apply(this, arguments));
              if ((res != null) && (f._kv || f._index)) {
                this.waitUntil(_save(rt, this.copy(res), f));
              }
            }
          } else if (f._index && !lg.qry && !rec && rt.indexOf('/') === -1 && !(exists = (await this.index(rt)))) { // create the index
            res = (await this.index(rt, (typeof f._index !== 'object' ? {} : {
              settings: f._index.settings,
              mappings: f._index.mappings,
              aliases: f._index.aliases
            })));
          }
        }
        if (f._diff && this.request.method === 'GET' && (res != null) && !lg.cached && !lg.async) {
          try {
            lg.args = JSON.stringify(arguments);
            if (Array.isArray(f._diff) && typeof f._diff[0] === 'string') {
              if (f._diff[0].startsWith('-')) { // it's a list of keys to ignore
                dr = this.copy(res);
                ref19 = f._diff;
                // it's a list of keys to include
                for (o = 0, len3 = ref19.length; o < len3; o++) {
                  d = ref19[o];
                  delete dr[d.replace('-', '')];
                }
              } else {
                dr = {};
                ref20 = f._diff;
                for (q = 0, len4 = ref20.length; q < len4; q++) {
                  di = ref20[q];
                  dr[di] = res[di];
                }
              }
              lg.res = JSON.stringify(dr);
            } else {
              lg.res = JSON.stringify(res); // what if this is huge? just checksum it?
            }
          } catch (error) {}
        }
        if (f._history && (f._index || f._kv) && (rec != null) && !Array.isArray(rec)) {
          try {
            lg.rec = JSON.stringify(rec); // record the incoming rec to record a history of changes to the record
          } catch (error) {}
        }
        if (lg.qry) {
          lg.qry = JSON.stringify(lg.qry);
        }
        try {
          lg.took = Date.now() - st;
        } catch (error) {}
        this.log(lg);
        return res;
      };
      wb = _wrapped.bind(this);
      for (uk in f) {
        if (uk.startsWith('_')) {
          if (wb._fn == null) {
            wb._fn = n; // set the function name if there are other underscored wraper settings to work with
          }
          wb[uk] = f[uk];
        }
      }
      return wb;
    }
  };
  // TODO add a way to identify and iterate multiple functions either parallel or serial, adding to results
  // e.g. split url at // for multi functions. Params parallel gives on obj of named results
  // with merge for one result overwriting as they're received, or if only merge then merge in order
  // auth would need to be present for every stage

  // loop through everything defined on P, wrap and configure all functions, and set them onto @ so they can be called in relation to this fetch event
  // also pick up any URL params provided along the way - anything that doesn't map to a function or an object is considered some sort of param
  // params will be added to @params, keyed to whatever the most recent URL part that DID map to a function was
  // so for example /svc/oaworks/find maps to svc.oaworks.find, and /svc/oaworks/find/10.1234/567890 ALSO maps to it, 
  // and puts the remainder of the route (which is a DOI) into @params.find, so the find function can read it from there
  schedule = []; // if called by a task scheduler, every _schedule function will be put in here, and these get run instead of the fn
  fn = void 0; // the actual function to run, once it's found (not just the name of it, which is put in @fn)
  prs = [...this.parts];
  pk = void 0;
  _lp = (p, a, n) => {
    var nd, ref10, results;
    // TODO consider if it would be useful to have the construct script build a default of this
    // NOTE that may reduce the configurability of it per call, or at least may require some additional config at call time anyway, 
    // which may limit the value of having it pre-configured in the first place
    //if p._index # add default additional index functions
    //  p[ik] ?= P.index[ik] for ik of P.index #['keys', 'terms', 'suggest', 'count', 'min', 'max', 'range']
    if (pk && this.fn.indexOf(n) === 0) {
      while (prs.length && (p[prs[0]] == null)) {
        this.params[pk] = (this.params[pk] ? this.params[pk] + '/' : '') + prs.shift();
      }
    }
    results = [];
    for (k in p) {
      if ((ref10 = typeof p[k]) !== 'function' && ref10 !== 'object') {
        try {
          results.push(a[k] = JSON.parse(JSON.stringify(p[k])));
        } catch (error) {
          results.push(a[k] = p[k]);
        }
      } else {
        nd = n + (n ? '.' : '') + k;
        a[k] = _return(p[k], nd);
        if (this.scheduled && a[k]._schedule) {
          schedule.push(a[k]);
        }
        if (!k.startsWith('_')) { // underscored methods cannot be accessed from URLs, and are never wrapped
          if (prs.length && prs[0] === k && this.fn.indexOf(n) === 0) {
            pk = prs.shift();
            this.fn += (this.fn === '' ? '' : '.') + pk;
            if (typeof a[k] === 'function' && n.indexOf('._') === -1) { // URL routes can't call _abc functions or ones under them
              fn = a[k];
            }
          }
          if (typeof a[k] === 'function' && !a[k]._hidden && !nd.startsWith('scripts') && nd.indexOf('.scripts') === -1 && !nd.startsWith('kv') && !nd.startsWith('index') && ((!nd.startsWith('svc') && !nd.startsWith('src')) || nd.split('.').length < 3)) {
            this.routes.push(nd.replace(/\./g, '/')); // TODO this could check the auth method, and only show things the current user can access, and also search for description / comment? NOTE this is just about visibility, they're still accessible if given right auth (if any)
          }
        }
        if (!Array.isArray(p[k]) && (!k.startsWith('_') || typeof a[k] === 'function')) {
          results.push(_lp(p[k], a[k], nd));
        } else {
          results.push(void 0);
        }
      }
    }
    return results;
  };
  _lp(P, this, '');
  if (pk && prs.length) { // catch any remaining url params beyond the max depth of P
    this.params[pk] = this.params[pk] ? this.params[pk] + '/' + prs.join('/') : prs.join('/');
  }
  // TODO should url params get some auto-processing like query params do above? Could be numbers, lists, bools...
  if (this.scheduled) {
    res = {};
    klogs = []; // move any logs first so that schedule can be aware of any recently run scheduled events
    await this.kv._each('log', async function(lk) {
      var l;
      if (lk.indexOf('/') !== -1 && lk !== 'log') {
        l = (await this.kv(lk, ''));
        if (l._id == null) {
          l._id = lk.split('/').pop();
        }
        return klogs.push(l);
      }
    });
    res.log = klogs.length;
    if (klogs.length) {
      this.waitUntil(this.index('log', klogs));
    }
    if (this.refresh === true) { // track if the main request included a refresh from the start, to force all scheduled events to happen regardless of timing (mainly for dev/test)
      requested_refresh = true;
    }
    for (m = 0, len2 = schedule.length; m < len2; m++) {
      fs = schedule[m];
      if (fs._fn) { //and fs._fn in ['svc.oaworks.permissions.journals']
        if (this.S.dev) { //and @S.bg is true
          console.log('scheduled', fs._fn);
        }
        if (typeof fs._schedule === 'function') {
          res[fs._fn] = true;
          this.waitUntil(fs._schedule());
        } else {
          fun = fs._fn.replace(/\./g, '_');
          recs = [];
          hhmm = true;
          if (typeof fs._schedule === 'number' || (typeof fs._schedule === 'string' && fs._schedule.length === 4 && fs._schedule.replace(/[0-9]/g, '').length === 0)) {
            // TODO consider changing this to accept cron style strings of space-separated numbers. For now can be time like "0900" or number of minutes like 240
            if (requested_refresh) {
              last = false;
            } else {
              lasts = (await this.index('log', 'logs.fn:"' + fs._fn + '" AND scheduled:true', true));
              last = ((lasts != null ? (ref10 = lasts.hits) != null ? ref10.hits : void 0 : void 0) != null) && lasts.hits.hits.length ? lasts.hits.hits[0]._source : false;
            }
            if (typeof last === 'object' && ((typeof fs._schedule === 'number' && last.started && (last.started + (fs._schedule * 60000)) > this.started) || (last.createdAt && (last.createdAt.split('T')[0].split('-').pop().replace(/^0/, '') === (new Date()).getDate().toString() || this.started < (new Date()).setHours(parseInt(fs._schedule.substring(0, 2)), parseInt(fs._schedule.substring(2)), 0, 0))))) {
              hhmm = false;
              res[fs._fn] = false;
            } else {
              hhmm = fs._schedule;
            }
          }
          if (hhmm !== false) {
            res[fs._fn] = true;
            if (fs._sheet) {
              if (typeof fs === 'function') {
                if (this.refresh == null) {
                  this.refresh = true;
                }
                await fs(); // await this one so that the kv import runs after
// will it ever not be a (wrapped) function?
              } else {
                recs = (await this.src.google.sheets(fs._sheet));
                if (Array.isArray(recs) && recs.length) {
                  await this.index(fun, '');
                }
              }
            } else if (typeof fs === 'function' && hhmm !== true) {
              this.waitUntil(fs());
            }
          }
          await this.kv._each(fun, async function(kn) {
            var rec;
            if (kn.indexOf('/') !== -1 && kn !== fun) {
              // this could also be used as a way to replicate changes back into a sheet after reload, if there was a unique identifier for records
              rec = (await this.kv(kn, fs._kv ? void 0 : '')); // if kv not explicitly set, delete when moving to index
              if (rec._id == null) {
                rec._id = kn.split('/').pop();
              }
              return recs.push(rec);
            }
          });
          if (typeof recs === 'object' && JSON.stringify(recs) !== '{}' && !Array.isArray(recs)) {
            recs = [recs];
          }
          if (Array.isArray(recs) && recs.length) {
            res[fs._fn] = recs.length;
            this.waitUntil(this.index(fun, recs));
          }
        }
      }
    }
  } else if (typeof fn === 'function') {
    if (this.S.name && this.S.system && this.headers['x-' + this.S.name + '-system'] === this.S.system) {
      this.system = true;
      authd = true; // would this be sufficient or could original user be required too
    } else {
      authd = (await this.auth());
      if (typeof authd === 'object' && authd._id && authd.email) {
        this.user = authd;
      }
      if (typeof fn._auth === 'function') {
        authd = (await fn._auth());
      } else if (fn._auth === true && (this.user != null)) { // just need a logged in user if true
        authd = true;
      } else if (fn._auth) { // which should be a string... comma-separated, or a list
        authd = (await this.auth.role(fn._auth)); // _auth should be true or name of required group.role
      } else {
        authd = true;
      }
    }
    // TODO check the blacklist
    if (authd) {
      if (typeof fn._format === 'string' && (ref11 = fn._format, indexOf.call(this.S.formats, ref11) >= 0)) {
        if (this.format == null) {
          this.format = fn._format;
        }
      }
      if ((ref12 = this.request.method) === 'HEAD' || ref12 === 'OPTIONS') {
        res = '';
      } else if (fn._cache !== false && !this.refresh && (this.request.method === 'GET' || (this.request.method === 'POST' && this.index._q(this.params))) && (res = (await this._cache()))) { // this will return empty if nothing relevant was ever put in there anyway
        // how about caching of responses to logged in users, by param or header?
        this.cached = 'cache';
        res = new Response(res.body, res); // no need to catch this for backend execution because cache function will never find anything on backend anyway
        res.headers.append('x-' + this.S.name + '-cached', 'cache'); // this would leave any prior "index" value, for example. Or use .set to overwrite
        res.headers.delete('x-' + this.S.name + '-took');
      } else {
        res = (await fn());
        this.completed = true;
      }
    } else {
      // Random delay for https://en.wikipedia.org/wiki/Timing_attack https://www.owasp.org/index.php/Blocking_Brute_Force_Attacks#Finding_Other_Countermeasures
      this.unauthorised = true;
      await this.sleep(200 * (1 + Math.random()));
      res = {
        status: 401 // not authorised
      };
      if (this.fn === 'svc.rscvd.supply') { // quick workaround for demo
        this.format = 'html';
      }
      if (this.format === 'html') {
        res.body = (await this.auth());
      }
    }
  }
  if (((res == null) || (typeof res === 'object' && res.status === 404)) && this.url.replace('.ico', '').replace('.gif', '').replace('.png', '').endsWith('favicon')) {
    res = '';
  }
  resp = typeof res === 'object' && !Array.isArray(res) && typeof ((ref13 = res.headers) != null ? ref13.append : void 0) === 'function' ? res : (await this._response(res, fn));
  if (this.scheduled || (this.parts.length && ((ref14 = this.parts[0]) !== 'log' && ref14 !== 'status') && ((ref15 = this.request.method) !== 'HEAD' && ref15 !== 'OPTIONS') && (res != null) && res !== '')) {
    if (this.completed && fn._cache !== false && resp.status === 200 && (typeof res !== 'object' || Array.isArray(res) || ((ref16 = res.hits) != null ? ref16.total : void 0) !== 0) && (!fn._sheet || typeof res !== 'number' || !this.refresh)) {
      this._cache(void 0, resp, fn._cache); // fn._cache can be a number of seconds for cache to live, so pass it to cache to use if suitable
    }
    this.log();
  }
  if (!this.completed && !this.cached && !this.unauthorised && !this.scheduled && this.S.pass && typeof this.S.bg === 'string' && ((ref17 = this.request.method) !== 'HEAD' && ref17 !== 'OPTIONS')) {
    // TODO add a regular schedule to check logs for things that didn't complete, and set them to _bg by default so they don't keep timing out
    throw new Error();
  } else {
    return resp;
  }
};

P._response = async function(res, fn) { // this provides a Response object. It's outside the main P.call so that it can be used elsewhere if convenient
  var base, base1, base2, h, keys, ref, ref1, ref2, ref3, ref4, ref5, status;
  if ((base = this.S).headers == null) {
    base.headers = {};
  }
  if (res == null) {
    res = 404;
    status = 404;
  } else if (this.fn !== 'status' && typeof res === 'object' && !Array.isArray(res) && ((typeof res.status === 'number' && res.status > 300 && res.status < 600) || res.headers)) {
    if (res.headers != null) {
      for (h in res.headers) {
        this.S.headers[h] = res.headers[h];
      }
      delete res.headers;
    }
    status = (ref = res.status) != null ? ref : 200;
    delete res.status;
    keys = this.keys(res);
    if (keys.length === 0) {
      res = status;
    } else if (keys.length === 1) { // if only one thing left, set the res to that. e.g. most likely body, content, json
      res = res[keys[0]];
    }
  } else {
    status = 200;
  }
  if (!this.S.headers['Content-Type'] && !this.S.headers['content-type']) {
    if (this.format && ((ref1 = this.format) === 'html' || ref1 === 'csv')) {
      if (typeof res !== 'string') {
        try {
          res = (await this.convert['json2' + this.format](res, {
            keys: (ref2 = fn != null ? (ref3 = fn['_' + this.format]) != null ? (ref4 = ref3._qopts) != null ? ref4.include : void 0 : void 0 : void 0) != null ? ref2 : fn != null ? (ref5 = fn._qopts) != null ? ref5.include : void 0 : void 0
          }));
        } catch (error) {}
      }
      this.S.headers['Content-Type'] = this.format === 'html' ? 'text/html; charset=UTF-8' : 'text/csv; charset=UTF-8';
    }
    if (typeof res !== 'string') {
      try {
        res = JSON.stringify(res, '', 2);
      } catch (error) {}
    }
    if ((base1 = this.S.headers)['Content-Type'] == null) {
      base1['Content-Type'] = 'application/json; charset=UTF-8';
    }
  }
  try {
    if ((base2 = this.S.headers)['Content-Length'] == null) {
      base2['Content-Length'] = Buffer.byteLength(res);
    }
  } catch (error) {}
  try {
    this.S.headers['x-' + this.S.name + '-took'] = Date.now() - this.started;
  } catch (error) {}
  try {
    if (this.cached) {
      this.S.headers['x-' + this.S.name + '-cached'] = this.cached;
    }
  } catch (error) {}
  try {
    return new Response(res, {
      status: status,
      headers: this.S.headers
    });
  } catch (error) {
    return {
      status: status,
      headers: this.S.headers,
      body: res
    };
  }
};

P.src = {};

P.svc = {};

P.scripts = {};

// curl -X GET "https://api.lvatn.com/auth" -H "x-id:YOURUSERIDHERE" -H "x-apikey:YOURAPIKEYHERE"
// curl -X GET "https://api.lvatn.com/auth?apikey=YOURAPIKEYHERE"

// NOTE all emails will be lowercased
// store user record object in kv as user/:UID (value is stringified json object)
// and store a map of API keys as well, user/apikey/:KEY (value is user ID) (could have more than one, and have ones that give different permissions)
// store a login token at auth/token/:TOKEN (value is email) (autoexpire login tokens at 10mins 600s)
// and store a resume token at auth/resume/:UID/:RESUMETOKEN (value is a timestamp) (autoexpire resume tokens at about three months 7890000s, but rotate them on non-cookie use)

// TODO check how system header auth should affect checks on auth and group/role activities further down the stack
// ideally should be ok to run anything after system hand-off that already got auth'd at top level, but check
var indexOf = [].indexOf;

P.auth = async function(key) {
  var cookie, email, oauth, ref, ref1, ref2, ref3, ref4, ref5, ref6, restok, resume, ret, uid, upd, user;
  try {
    if (this.S.name && this.S.system && this.headers['x-' + S.name + '-system'] === this.S.system) {
      return true;
    }
  } catch (error) {}
  // if params.auth, someone looking up the URL route for this acc. Who would have the right to see that?
  if (typeof key === 'string') {
    return (await this.kv('user/' + (key.includes('@') ? this.hashhex(key) : key)));
  }
  if ((this.params.access_token && (oauth = (await this.oauth(this.params.access_token)))) || ((this.params.token || this.params.auth) && (email = (await this.kv('auth/token/' + ((ref = this.params.token) != null ? ref : this.params.auth), ''))))) { // true causes delete after found
    if (!(user = (await this.kv('user/' + this.hashhex((ref1 = oauth != null ? oauth.email : void 0) != null ? ref1 : email))))) { // get the user record if it already exists
      user = (await this.auth._insert(oauth != null ? oauth : email)); // create the user record if not existing, as this is the first token login attempt for this email address
    }
  }
  if (!user && this.apikey && (uid = (await this.kv('user/apikey/' + this.apikey)))) {
    user = (await this.kv('user/' + uid)); // no user creation if apikey doesn't match here - only create on login token above 
  }
  if (!user && (this.params.resume || this.cookie)) { // accept resume on a header too?
    if (!(resume = this.params.resume)) { // login by resume token if provided in param or cookie
      try {
        cookie = JSON.parse(decodeURIComponent(this.cookie).split(((ref2 = (ref3 = S.auth) != null ? (ref4 = ref3.cookie) != null ? ref4.name : void 0 : void 0) != null ? ref2 : 'pradm') + "=")[1].split(';')[0]);
        resume = cookie.resume;
        uid = cookie._id;
      } catch (error) {}
    }
    if (uid == null) {
      uid = this.id; // if picked up from incoming params
    }
    if (this.params.email && !uid) {
      uid = this.hashhex(this.params.email); // accept resume with email instead of id?
    }
    if (resume && uid && (restok = (await this.kv('auth/resume/' + uid + '/' + resume, (this.params.resume ? '' : void 0))))) { // delete if not a cookie resume
      user = (await this.kv('user/' + uid));
      user.resume = resume;
    }
  }
  if (typeof user === 'object' && user._id) {
    // if 2fa is enabled, request a second form of ID (see below about implementing 2fa)

    // record the user login timestamp, and if login came from a service the user does not yet have a role in, add the service user role
    // who can add the service param?
    if (this.params.service && (((ref5 = user.roles) != null ? ref5[this.params.service] : void 0) == null)) {
      upd = {};
      upd.roles = (ref6 = user.roles) != null ? ref6 : {};
      upd.roles[this.params.service] = 'user';
      this.kv('user/' + user._id, upd, user); // record the user login time?
    }
    if (this.params.resume || this.params.token || this.params.auth) {
      // if a fresh login or resume token was used explicitly, provide a new resume token
      user.resume = this.uid();
      this.kv('auth/resume/' + user._id + '/' + user.resume, Date.now(), 7890000); // resume token lasts three months (could make six at 15768000)
    }
  }
  
  //if @auth.role 'root', @user
  //  lg = msg: 'Root login from ' + @request.headers['x-forwarded-for'] + ' ' + @request.headers['cf-connecting-ip'] + ' ' + @request.headers['x-real-ip']
  //  lg.notify = subject: lg.msg
  //  @log lg

  // if this is called with no variables, and no defaults, provide a count of users?
  // but then if logged in and on this route, what does it provide? the user account?
  if ((key == null) && (user == null) && this.format === 'html') {
    ret = '<input id="pradmEmail" class="pradmEmail" style="min-width:250px;" type="text" name="email" placeholder="Enter your email address to sign in"><input id="pradmToken" class="pradmToken" style="display:none;min-width:250px;" type="text" name="token" placeholder="Enter the login token once you receive it">';
    ret += '<script type="text/javascript" src="/client/pradm.js"></script><script type="text/javascript" src="/client/pradmLogin.js"></script>';
    ret += '<script>pradm.next = true;</script>';
    return ret;
  } else {
    return user;
  }
};

P.auth.token = function(email, from, subject, text, html, template, url) {
  var ref, ref1, ref2, ref3, token;
  if (email == null) {
    email = this.params.email;
  }
  if (email) {
    email = email.trim().toLowerCase();
    if (from == null) {
      from = (ref = (ref1 = S.auth) != null ? ref1.from : void 0) != null ? ref : 'login@example.com';
    }
    if (subject == null) {
      subject = (ref2 = (ref3 = S.auth) != null ? ref3.subject : void 0) != null ? ref2 : 'Please complete your login';
    }
    token = this.uid(8);
    if (this.S.dev && this.S.bg === true) {
      console.log(email, token);
    }
    if (url == null) {
      url = this.params.url;
    }
    if (url) {
      url += '#' + token;
    } else {
      url = this.base + '/' + this.route.replace('/token', '/' + token);
    }
    this.kv('auth/token/' + token, email, 600); // create a token that expires in 10 minutes
    this.waitUntil(this.mail({
      from: from,
      to: email,
      subject: subject,
      text: text != null ? text : 'Your login code is:\r\n\r\n' + token + '\r\n\r\nor use this link:\r\n\r\n' + url + '\r\n\r\nnote: this single-use code is only valid for 10 minutes.',
      html: html != null ? html : '<html><body><p>Your login code is:</p><p><b>' + token + '</b></p><p>or click on this link</p><p><a href=\"' + url + '\">' + url + '</a></p><p>note: this single-use code is only valid for 10 minutes.</p></body></html>',
      //template: template
      params: {
        token: token,
        url: url
      }
    }));
    return {
      email: email
    };
  } else {
    return this.uid(8); // is there a case where this would somehow be useful? It's not getting saved anywhere for later confirmation...
  }
};


// auth/role/:grl/:uid
// any logged in user can find out if any other user is in a role
P.auth.role = async function(grl, uid) {
  var cascade, g, group, i, j, len, len1, ref, ref1, ref2, ref3, ri, rl, role, user;
  if (grl == null) {
    grl = this.params.role;
  }
  if ((grl == null) && typeof ((ref = this.params) != null ? ref.auth : void 0) === 'string') {
    grl = this.params.auth;
  }
  if (typeof grl === 'string' && grl.indexOf('/') !== -1) {
    if (uid == null) {
      uid = grl.split('/').pop();
      grl = grl.replace('/' + uid, '');
    }
  }
  user = typeof uid === 'object' ? uid : typeof uid === 'string' ? (await this.kv(uid.includes('@') ? this.hashhex(uid) : uid)) : this.user;
  if ((user != null ? user.roles : void 0) == null) {
    return false;
  }
  if (typeof grl === 'string') {
    grl = [grl];
  }
  for (i = 0, len = grl.length; i < len; i++) {
    g = grl[i];
    g = g.replace('/', '.');
    [group, role] = g.split('.');
    if (role == null) {
      role = group;
      group = '__global__';
    }
    if (group === user.id) { // user is owner on their own group
      return 'owner';
    }
    if (indexOf.call((ref1 = user.roles.__global__) != null ? ref1 : [], 'root') >= 0) {
      return 'root';
    }
    if (indexOf.call((ref2 = user.roles[group]) != null ? ref2 : [], role) >= 0) {
      return role;
    }
    if (user.roles[group] != null) {
      cascade = ['root', 'service', 'owner', 'super', 'admin', 'auth', 'bulk', 'delete', 'remove', 'create', 'insert', 'publish', 'put', 'draft', 'post', 'edit', 'update', 'user', 'get', 'read', 'info', 'public'];
      if (0 < (ri = cascade.indexOf(role))) {
        ref3 = cascade.splice(0, ri);
        for (j = 0, len1 = ref3.length; j < len1; j++) {
          rl = ref3[j];
          if (indexOf.call(user.roles[group], rl) >= 0) {
            return rl;
          }
        }
      }
    }
  }
  return false;
};

P.auth.roles = async function(user, grl, keep) {
  var base, group, ref, ref1, ref2, role;
  if (user == null) {
    user = (ref = this.user) != null ? ref : this.params.roles;
  }
  if (typeof user === 'string') {
    user = (await this.kv('user/' + (user.includes('@') ? this.hashhex(user) : user)));
  }
  // what about one logged in user acting on the roles route of another?
  [group, role] = grl.split('.');
  if (role == null) {
    role = group;
    group = '__global__';
  }
  if ((ref1 = indexOf.call((ref2 = user.roles) != null ? ref2[group] : void 0, role) >= 0) != null ? ref1 : []) {
    if (keep != null) {
      user.roles[group].splice(user.roles[group].indexOf(role), 1);
      return this.kv('user/' + user._id, user);
    }
  } else {
    if ((base = user.roles)[group] == null) {
      base[group] = [];
    }
    user.roles.group.push(role);
    return this.kv('user/' + user._id, user);
  }
};

P.auth.logout = function(user) { // how about triggering a logout on a different user account
  var ret;
  if (user == null) {
    user = this.user;
  }
  if (user) {
    this.kv('auth/resume/' + (typeof user === 'string' ? (user.includes('@') ? this.hashhex(user) : user) : user._id), '');
  }
  if (this.format === 'html') {
    ret = '<p id="logout">Logging out...</p>';
    ret += '<script type="text/javascript" src="/client/pradm.js"></script><script type="text/javascript" src="/client/pradmLogin.js"></script>';
    ret += `<script>
setTimeout(function() {
  pradm.logout();
  pradm.html('#logout', "You're logged out");
}, 2000);
</script>`;
    return ret;
  }
};

// add a 2FA mechanism to auth (authenticator, sms...)
// https://stackoverflow.com/questions/8529265/google-authenticator-implementation-in-python/8549884#8549884
// https://github.com/google/google-authenticator
// http://blog.tinisles.com/2011/10/google-authenticator-one-time-password-algorithm-in-javascript/
//P.authenticator = () ->
// TODO if an authenticator app token is provided, check it within the 30s window
// delay responses to 1 per second to stop brute force attacks
// also need to provide the token/qr to initialise the authenticator app with the service
//  return false

// device fingerprinting was available in the old code but no explicit requirement for it so not added here yet
// old code also had xsrf tokens for FORM POSTs, add that back in if relevant
P._oauth = async function(token, cid) {
  var ref, ref1, ref10, ref11, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, ret, sets, validate;
  // https://developers.google.com/identity/protocols/OAuth2UserAgent#validatetoken
  sets = {};
  if (token) { //?= @params.access_token
    try {
      // we did also have facebook oauth in here, still in old code, but decided to drop it unless explicitly required again
      validate = (await this.fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + token, {
        method: 'POST' // has to be a POST even though it sends nothing
      }));
      if (cid == null) {
        cid = (ref = (ref1 = this.S.svc[(ref2 = this.params.service) != null ? ref2 : 'z']) != null ? (ref3 = ref1.google) != null ? (ref4 = ref3.oauth) != null ? (ref5 = ref4.client) != null ? ref5.id : void 0 : void 0 : void 0 : void 0) != null ? ref : (ref6 = S.use) != null ? (ref7 = ref6.google) != null ? (ref8 = ref7.oauth) != null ? (ref9 = ref8.client) != null ? ref9.id : void 0 : void 0 : void 0 : void 0;
      }
      if ((cid != null) && ((ref10 = validate.data) != null ? ref10.aud : void 0) === cid) {
        ret = (await this.fetch('https://www.googleapis.com/oauth2/v2/userinfo?access_token=' + token));
        return {
          email: ret.data.email.toLowerCase(),
          google: {
            id: ret.data.id
          },
          name: (ref11 = ret.data.name) != null ? ref11 : ret.data.given_name + (ret.data.family_name ? ' ' + ret.data.family_name : ''),
          avatar: ret.data.picture
        };
      }
    } catch (error) {}
  }
  return void 0;
};

// an oauth client-side would require the google oauth client token. It's not a secret, but must be got in advance from google account provider
// ours is '360291218230-r9lteuqaah0veseihnk7nc6obialug84.apps.googleusercontent.com' - but that's no use to anyone else, unless wanting to login with us
// the Oauth URL that would trigger something like this would be like:
// grl = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=token&include_granted_scopes=true'
// grl += '&scope=https://www.googleapis.com/auth/userinfo.email+https://www.googleapis.com/auth/userinfo.profile'
// grl += '&state=' + state + '&redirect_uri=' + pradm.oauthRedirectUri + '&client_id=' + pradm.oauthGoogleClientId
// state would be something like Math.random().toString(36).substring(2,8) and would be sent and also kept for checking against the response
// the response from oauth login page would go back to current page and have a # with access_token= and state=
// NOTE as it is after a # these would only be available on a browser, as servers don't get the # part of a URL
// if the states match, send the access_token into the above method and if it validates then we can login the user
P.auth._insert = function(obj) {
  var first, u;
  if (typeof obj === 'string') {
    obj = {
      email: obj
    };
  }
  if (typeof obj.email !== 'string' || !obj.email.includes('@')) {
    return false;
  }
  u = {
    _id: this.hashhex(obj.email.trim().toLowerCase()),
    email: obj.email, //store email here or not?
    apikey: this.uid() // store the apikey here or not?
  };
  delete obj.email;
  u.profile = obj; // could use obj as profile input data? better for services to store this where necessary though
  first = false; // if no other user accounts yet
  u.roles = first ? {
    __global__: ['root']
  } : {};
  u.createdAt = new Date();
  this.kv('user/apikey/' + u.apikey, u._id);
  this.kv('user/' + u._id, u);
  return u;
};

P.auth._update = async function(r, user) {
  var a, nu, p;
  if (user == null) {
    user = r.auth; // what about update a user other than the logged in one?
  }
  if (r.param && (nu = this.auth(r.param))) {
    a = ''; // does the currently authorised user have permission to update the user being queried? if so, set user to nu
  }
  if (JSON.stringify(r.params) !== '{}') {
    if (user.profile == null) {
      user.profile = {};
    }
// normal user can update profile values
    for (p in r.params) {
      user.profile[p] = pr[p];
    }
    await this.kv('user/' + user.id, user);
    return true; // or return the updated user object?
  } else {
    return false;
  }
};

P.auth._remove = async function(key) {
  var ref, user;
  if (key.startsWith('user/')) {
    key = key.replace('user/', '');
  }
  if (key.includes('@')) {
    key = this.hashhex(key);
  }
  user = ((ref = this.user) != null ? ref._id : void 0) === key ? this.user : (await this.kv('user/' + key));
  try {
    this.auth.logout(key);
  } catch (error) {}
  try {
    this.kv('user/apikey/' + user.apikey, '');
  } catch (error) {}
  try {
    return this.kv('user/' + key, '');
  } catch (error) {}
};

var indexOf = [].indexOf;

if (P.convert == null) {
  P.convert = {};
}

P.convert.json2csv = async function(recs, params) {
  var h, headers, i, idlink, j, k, len, len1, newline, nk, quote, rc, rec, records, ref, ref1, ref2, ref3, ref4, ref5, ref6, rs, separator;
  if (recs == null) {
    recs = (ref = this.body) != null ? ref : this.params;
  }
  if (params == null) {
    params = this.params;
  }
  if (params.url) {
    recs = (await this.fetch(params.url));
  }
  if (params.es || ((recs != null ? (ref1 = recs.hits) != null ? ref1.hits : void 0 : void 0) != null)) {
    try {
      recs = recs.hits.hits;
      params.es = true;
    } catch (error) {}
  }
  if (!Array.isArray(recs)) {
    recs = [recs];
  }
  quote = (ref2 = params.quote) != null ? ref2 : '"';
  separator = (ref3 = params.separator) != null ? ref3 : ',';
  newline = (ref4 = params.newline) != null ? ref4 : '\n';
  if (!recs.length) {
    return '';
  } else {
    headers = (ref5 = params.keys) != null ? ref5 : [];
    records = '';
    for (i = 0, len = recs.length; i < len; i++) {
      rec = recs[i];
      if (records.length) {
        records += newline;
      }
      if (params.es !== false && (rec._source || rec.fields)) {
        rs = (ref6 = rec._source) != null ? ref6 : rec.fields;
        rc = {};
        idlink = true;
        if (!params.keys || indexOf.call(params.keys, '_id') >= 0) {
          rc._id = '<a onclick="this.setAttribute(\'href\', window.location.href.split(\'.html\')[0].split(\'/\').pop() + \'/\' + this.getAttribute(\'href\') )" href="' + rec._id + '.html">' + rec._id + '</a>';
          idlink = false;
        }
// could add controls to alter the order here, or customise key names
        for (nk in rs) {
          if (rc[nk] == null) {
            rc[nk] = rs[nk];
          }
          if (idlink && nk === params.keys[0]) {
            try {
              rc[nk] = '<a onclick="this.setAttribute(\'href\', window.location.href.split(\'.html\')[0].split(\'/\').pop() + \'/\' + this.getAttribute(\'href\') )" href="' + rec._id + '.html">' + rs[nk] + '</a>';
            } catch (error) {}
            idlink = false;
          }
        }
        rec = rc;
      }
      if (params.flatten) {
        rec = (await this.flatten(rec));
      }
      if (params.subset) {
        rec = (await this.dot(rec, params.subset));
      }
      if (!params.keys) {
        for (k in rec) {
          if ((rec[k] != null) && indexOf.call(headers, k) < 0) {
            headers.push(k);
          }
        }
      }
      for (j = 0, len1 = headers.length; j < len1; j++) {
        h = headers[j];
        if (records.length && !records.endsWith(newline)) {
          records += separator;
        }
        records += quote;
        if (rec[h] != null) {
          try {
            if (Array.isArray(rec[h]) && rec[h].length === 1 && Array.isArray(rec[h][0])) {
              rec[h] = rec[h][0];
            }
          } catch (error) {}
          try {
            if (Array.isArray(rec[h]) && rec[h].length && typeof rec[h][0] === 'string') {
              rec[h] = rec[h].join(', ');
            }
          } catch (error) {}
          try {
            if (typeof rec[h] === 'object') {
              rec[h] = JSON.stringify(rec[h]);
            }
          } catch (error) {}
          try {
            rec[h] = rec[h].replace(/"/g, quote + quote);
          } catch (error) {}
          try {
            rec[h] = rec[h].replace(/,,/g, separator); // TODO change this for a regex of the separator
          } catch (error) {}
          try {
            rec[h] = rec[h].replace(/\n/g, ' ');
          } catch (error) {}
          try {
            rec[h] = rec[h].replace(/\s\s/g, ' ');
          } catch (error) {}
          try {
            records += rec[h];
          } catch (error) {}
        }
        records += quote;
      }
    }
    return quote + headers.join(quote + separator + quote) + quote + '\n' + records;
  }
};

P.convert.csv2json = async function(csv, params) {
  var h, header, headers, i, j, len, len1, len2, line, lines, m, newline, quote, ref, ref1, ref2, ref3, res, row, separator, vals;
  if (csv == null) {
    csv = (ref = this.body) != null ? ref : this.params.csv;
  }
  if (this.params.url) {
    csv = (await this.fetch(url));
  }
  if (params == null) {
    params = this.params;
  }
  quote = (ref1 = params.quote) != null ? ref1 : '"';
  separator = (ref2 = params.separator) != null ? ref2 : ',';
  newline = (ref3 = params.newline) != null ? ref3 : '\n';
  csv = csv.replace(/""/g, 'XXX_QUOTER_GOES_HERE_XXX'); // TODO change this for a regex of whatever the quote char is
  res = [];
  if (typeof csv === 'string' && csv.length) {
    lines = csv.split(newline);
    if (lines.length) {
      headers = lines.shift().split(quote + separator);
// TODO add handling for flattened object headers eg metadata.author.0.name
// should do this by making an unflatten utility that goes through the object and rebuilds
      for (i = 0, len = headers.length; i < len; i++) {
        header = headers[i];
        if (header.indexOf(quote) === 0) {
          header = header.replace(quote, '');
        }
      }
      for (j = 0, len1 = lines.length; j < len1; j++) {
        line = lines[j];
        row = {};
        vals = line.split(quote + separator);
        for (m = 0, len2 = headers.length; m < len2; m++) {
          h = headers[m];
          if (vals.length) {
            row[h] = vals.shift();
            if (row[h]) {
              row[h] = row[h].replace(/^"/, '').replace(/"$/, '').replace(/XXX_QUOTER_GOES_HERE_XXX/g, quote);
              try {
                row[h] = JSON.parse(row[h]);
              } catch (error) {}
            }
          }
        }
        res.push(row);
      }
    }
  }
  return res;
};

P.convert.csv2html = async function(csv) {
  var header, headers, i, j, len, len1, len2, line, lines, ln, m, newline, quote, ref, ref1, ref2, res, separator, v, vn;
  if (csv == null) {
    csv = (ref = this.body) != null ? ref : this.params.csv;
  }
  if (this.params.url) {
    csv = (await this.fetch(url));
  }
  quote = '"';
  separator = ',';
  newline = '\n';
  csv = csv.replace(/,,/g, separator + quote + quote + separator); // TODO change this for a regex of the separator
  res = '<style>table.paradigm tr:nth-child(even) {background: #eee}table.paradigm tr:nth-child(odd) {background: #fff}</style>\n';
  res += '<table class="paradigm" style="border-collapse: collapse;">\n';
  if (typeof csv === 'string' && csv.length) {
    lines = csv.split(newline);
    if (lines.length) {
      res += '<thead><tr>';
      headers = lines.shift();
      ln = 0;
      ref1 = headers.split(quote + separator + quote);
      for (i = 0, len = ref1.length; i < len; i++) {
        header = ref1[i];
        res += '<th style="padding:2px; border:1px solid #ccc;">' + header.replace(/"/g, '') + '</th>';
        ln += 1;
      }
      res += '</tr></thead>\n<tbody>\n';
      for (j = 0, len1 = lines.length; j < len1; j++) {
        line = lines[j];
        res += '<tr>';
        while (line.indexOf(',"",') !== -1) {
          line = line.replace(',"",', ',"XXX_EMPTY_XXX",');
        }
        while (line.startsWith('"",')) {
          line = line.replace('"",', '"XXX_EMPTY_XXX",');
        }
        while (line.endsWith(',""')) {
          line = line.slice(0, line.length - 3);
        }
        line = line.replace(/""/g, 'XXX_QUOTER_GOES_HERE_XXX'); // TODO change this for a regex of whatever the quote char is
        vn = 0;
        ref2 = line.split(quote + separator + quote);
        for (m = 0, len2 = ref2.length; m < len2; m++) {
          v = ref2[m];
          vn += 1;
          res += '<td style="padding:2px; border:1px solid #ccc;vertical-align:text-top;">';
          v = v.replace(/^"/, '').replace(/"$/, '');
          if (v !== 'XXX_EMPTY_XXX') {
            if (v.indexOf('{') === 0 || v.indexOf('[') === 0) {
              res += '<a href="#" onclick="if (this.nextSibling.style.display === \'none\') {this.nextSibling.style.display = \'block\'} else {this.nextSibling.style.display = \'none\'}; return false;">...</a><div style="display:none;">';
              res += (await this.convert.json2html(JSON.parse(v.replace(/XXX_QUOTER_GOES_HERE_XXX/g, quote))));
              res += '</div>';
            } else {
              res += v.replace(/XXX_QUOTER_GOES_HERE_XXX/g, quote); // .replace(/\</g, '&lt;').replace(/\>/g, '&gt;')
            }
          }
          res += '</td>'; // add a regex replace of the separator, avoiding escaped instances
        }
        while (vn < ln) {
          res += '<td style="padding:2px; border:1px solid #ccc;vertical-align:text-top;"></td>';
          vn += 1;
        }
        res += '</tr>\n';
      }
      res += '</tbody>\n';
    }
  }
  return res + '</table>';
};

P.convert.json2html = async function(recs, params) {
  var _draw, i, j, key, len, len1, len2, m, part, parts, pt, ref, ref1, ref2, ref3, res, st, tbl;
  if (recs == null) {
    recs = (ref = this.body) != null ? ref : this.params;
  }
  if (params == null) {
    params = this.params;
  }
  if (params.url) {
    recs = (await this.fetch(url));
  }
  if (params.new) {
    if (params.edit == null) {
      params.edit = true;
    }
    recs = {};
    ref1 = (await this.index.keys(this.route.replace(/\//g, '_')));
    for (i = 0, len = ref1.length; i < len; i++) {
      key = ref1[i];
      recs[key] = ''; // could also get mapping types from here, and need to handle nesting eventually
    }
  }
  if (params.subset && !Array.isArray(recs)) {
    parts = params.subset.split('.');
    while (part = parts.shift()) {
      if (typeof recs === 'object' && !Array.isArray(recs) && (recs[part] != null)) {
        recs = recs[part];
      } else {
        break;
      }
    }
  }
  if (Array.isArray(recs) || ((recs != null ? (ref2 = recs.hits) != null ? ref2.hits : void 0 : void 0) && params.es !== false)) {
    if (parts != null) {
      params.subset = parts.join('.');
    }
    tbl = (await this.convert.csv2html((await this.convert.json2csv(recs, params))));
    return tbl;
  } else {
    res = '<div>';
    if (params.edit) { // extras only for rscvd for now but should be any management fields to add and not yet present
      res += '<div style="clear:both; margin:-1px 0px;"><div style="float:left;width: 150px; overflow: scroll;"><b><p>status</p></b></div>';
      res += '<div style="float:left;"><select class="pradmForm" id="status" style="margin-top:15px;margin-bottom:0px;min-width:180px;">';
      ref3 = ['', 'Verified', 'Denied', 'Progressing', 'Overdue', 'Provided', 'Cancelled', 'Done'];
      for (j = 0, len1 = ref3.length; j < len1; j++) {
        st = ref3[j];
        res += '<option' + (recs.status === st ? ' selected="selected"' : '') + '>' + st + '</option>';
      }
      delete recs.status;
      res += '</select></div>';
    }
    if (params.flatten) {
      recs = (await this.flatten(recs));
      res += '<input type="hidden" id="options_flatten" value="true">';
    }
    if (params.subset) {
      if (parts.length) {
        for (m = 0, len2 = parts.length; m < len2; m++) {
          pt = parts[m];
          recs = recs[pt];
        }
      }
      res += '<h3>' + params.subset + ':</h3>';
      res += '<input type="hidden" id="options_subset" value="' + params.subset + '">';
    }
    _draw = (rec) => {
      var k, len3, len4, n, o, ok, pk, ref4, ref5, results, rks;
      if (params.edit) { // just for rscvd demo for now
        if (rec.comments == null) {
          rec.comments = '';
        }
      }
      if (params.keys) {
        ref4 = params.keys;
        for (n = 0, len3 = ref4.length; n < len3; n++) {
          pk = ref4[n];
          if (rec[pk] == null) {
            rec[pk] = '';
          }
        }
      }
      results = [];
      for (k in rec) {
        try {
          if (Array.isArray(rec[k]) && rec[k].length === 1 && Array.isArray(rec[k][0])) {
            // for example crossref date-parts are an array in an array, pretty useless, so dump the external array
            rec[k] = rec[k][0];
          }
        } catch (error) {}
        if ((rec[k] != null) && (!Array.isArray(rec[k]) || rec[k].length) && (!params.keys || indexOf.call(params.keys, k) >= 0)) {
          res += '<div style="clear:both; ' + (!params.edit ? 'border:1px solid #ccc; ' : '') + 'margin:-1px 0px;"><div style="float:left;width: 150px; overflow: scroll;"><b><p>' + k + '</p></b></div>';
          res += '<div style="float:left;">';
          res += params.edit ? '<textarea class="pradmForm" id="' + k + '" style="min-height:80px;width:100%;margin-bottom:5px;">' : '';
          if (Array.isArray(rec[k])) {
            if (typeof rec[k][0] === 'object') {
              ref5 = rec[k];
              for (o = 0, len4 = ref5.length; o < len4; o++) {
                ok = ref5[o];
                _draw(ok);
              }
            } else {
              try {
                rks = rec[k].join(', ');
              } catch (error) {
                try {
                  rks = JSON.stringify(rec[k]);
                } catch (error) {
                  rks = rec[k];
                }
              }
              try {
                res += (params.edit ? '' : '<p>') + rks + (params.edit ? '' : '</p>');
              } catch (error) {}
            }
          } else if (typeof rec[k] === 'object') {
            _draw(rec[k]);
          } else {
            res += (params.edit ? '' : '<p>') + rec[k] + (params.edit ? '' : '</p>');
          }
          res += params.edit ? '</textarea>' : '';
          results.push(res += '</div></div>');
        } else {
          results.push(void 0);
        }
      }
      return results;
    };
    _draw(recs);
    res += '</div>';
    if (params.edit) {
      res = '<script type="text/javascript" src="/client/pradm.js"></script><script type="text/javascript" src="/client/pradmEdit.js"></script>' + res;
      res += '<script type="text/javascript">pradm.edit()</script>';
    }
    return res;
  }
};

P.convert.json2txt = async function(content) {
  var _extract, ref, strings;
  if (content == null) {
    content = (ref = this.body) != null ? ref : this.params;
  }
  if (this.params.url) {
    content = (await this.fetch(this.params.url));
  }
  strings = [];
  _extract = async function(content) {
    var c, i, len, results, results1;
    if (Array.isArray(content)) {
      results = [];
      for (i = 0, len = content.length; i < len; i++) {
        c = content[i];
        results.push((await _extract(c)));
      }
      return results;
    } else if (typeof content === 'object') {
      results1 = [];
      for (c in content) {
        results1.push((await _extract(content[c])));
      }
      return results1;
    } else if (content) {
      return strings.push(content);
    }
  };
  await _extract(content);
  return strings.join(' ');
};

`P.convert.table2csv = (content) ->
  d = P.convert.table2json content, opts
  return P.convert.json2csv d

P.convert.table2json = () ->
  return @convert.json2csv await @convert.table2csv

P.convert.html2txt = (content) -> # or xml2txt
  text = html2txt.fromString(content, {wordwrap: 130})
  return text
P.convert.xml2txt = (content) ->
  return @convert.html2txt content

P.convert.xml2json = (content) ->
  # TODO needs to handle attributes etc
  return ''`;

P.convert._hexMatch = {
  '0': '0000',
  '1': '0001',
  '2': '0010',
  '3': '0011',
  '4': '0100',
  '5': '0101',
  '6': '0110',
  '7': '0111',
  '8': '1000',
  '9': '1001',
  'a': '1010',
  'b': '1011',
  'c': '1100',
  'd': '1101',
  'e': '1110',
  'f': '1111'
};

P.convert.hex2bin = function(ls) {
  var i, l, len, ref, res;
  res = [];
  ref = (!Array.isArray(ls) ? [ls] : ls);
  for (i = 0, len = ref.length; i < len; i++) {
    l = ref[i];
    res.push(P.convert._hexMatch[l.toLowerCase()]);
  }
  return res.join('');
};

P.convert.bin2hex = function(ls) {
  var els, hm, i, k, l, len, pr, res, sls;
  // this needs work...
  if (!Array.isArray(ls)) {
    els = [];
    sls = ls.split('');
    pr = '';
    while (sls.length) {
      pr += sls.shift();
      if (pr.length === 4) {
        els.push(pr);
        pr = '';
      }
    }
    ls = els;
  }
  res = [];
  hm = {};
  for (k in P.convert._hexMatch) {
    hm[P.convert._hexMatch[k]] = k;
  }
  for (i = 0, len = ls.length; i < len; i++) {
    l = ls[i];
    res.push('0x' + hm[l]);
  }
  return new Buffer(res).toString();
};

P.convert.buf2bin = function(buf) {
  var c, ret;
  if (Buffer.isBuffer(buf)) {
    buf = buf.toString('hex');
  }
  buf = buf.replace(/^0x/, '');
  ret = '';
  c = 0;
  while (c < buf.length) {
    ret += P.convert.hex2bin(buf[c]);
    c++;
  }
  return ret;
};

P.convert._mimes = {
  '.aac': 'audio/aac', // AAC audio	
  '.abw': 'application/x-abiword', // AbiWord document
  '.arc': 'application/x-freearc', // Archive document (multiple files embedded)
  '.avi': 'video/x-msvideo', // AVI: Audio Video Interleave
  '.azw': 'application/vnd.amazon.ebook', // Amazon Kindle eBook format
  '.bin': 'application/octet-stream', // Any kind of binary data
  '.bmp': 'image/bmp', // Windows OS/2 Bitmap Graphics
  '.bz': 'application/x-bzip', // BZip archive
  '.bz2': 'application/x-bzip2', // BZip2 archive
  '.csh': 'application/x-csh', // C-Shell script
  '.css': 'text/css', // Cascading Style Sheets (CSS)
  '.csv': 'text/csv', // Comma-separated values (CSV)
  '.doc': 'application/msword', // Microsoft Word
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Microsoft Word (OpenXML)
  '.eot': 'application/vnd.ms-fontobject', // MS Embedded OpenType fonts
  '.epub': 'application/epub+zip', // Electronic publication (EPUB)
  '.gz': 'application/gzip', // GZip Compressed Archive
  '.gif': 'image/gif', // Graphics Interchange Format (GIF)
  '.htm': 'text/html', // HyperText Markup Language (HTML)
  '.ico': 'image/vnd.microsoft.icon', // Icon format
  '.ics': 'text/calendar', // iCalendar format
  '.jar': 'application/java-archive', // Java Archive (JAR)
  '.jpg': 'image/jpeg', // JPEG images
  '.js': 'text/javascript', // JavaScript
  '.json': 'application/json', // JSON format
  '.jsonld': 'application/ld+json', // JSON-LD format
  '.mid': 'audio/midi', // Musical Instrument Digital Interface (MIDI) audio/x-midi
  '.mjs': 'text/javascript', // JavaScript module
  '.mp3': 'audio/mpeg', // MP3 audio
  '.mpeg': 'video/mpeg', // MPEG Video
  '.mpkg': 'application/vnd.apple.installer+xml', // Apple Installer Package
  '.odp': 'application/vnd.oasis.opendocument.presentation', // OpenDocument presentation document
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet', // OpenDocument spreadsheet document
  '.odt': 'application/vnd.oasis.opendocument.text', // OpenDocument text document
  '.oga': 'audio/ogg', // OGG audio
  '.ogv': 'video/ogg', // OGG video
  '.ogx': 'application/ogg', // OGG
  '.opus': 'audio/opus', // Opus audio
  '.otf': 'font/otf', // OpenType font
  '.png': 'image/png', // Portable Network Graphics
  '.pdf': 'application/pdf', // Adobe Portable Document Format (PDF)
  '.php': 'application/php', // Hypertext Preprocessor (Personal Home Page)
  '.ppt': 'application/vnd.ms-powerpoint', // Microsoft PowerPoint
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', // Microsoft PowerPoint (OpenXML)
  '.py': 'text/plain',
  '.rar': 'application/vnd.rar', // RAR archive
  '.rb': 'text/plain',
  '.rtf': 'application/rtf', // Rich Text Format (RTF)
  '.sh': 'application/x-sh', // Bourne shell script
  '.svg': 'image/svg+xml', // Scalable Vector Graphics (SVG)
  '.swf': 'application/x-shockwave-flash', // Small web format (SWF) or Adobe Flash document
  '.tar': 'application/x-tar', // Tape Archive (TAR)
  '.tif': 'image/tiff', // Tagged Image File Format (TIFF)
  '.ts': 'video/mp2t', // MPEG transport stream
  '.ttf': 'font/ttf', // TrueType Font
  '.txt': 'text/plain', // Text, (generally ASCII or ISO 8859-n)
  '.vsd': 'application/vnd.visio', // Microsoft Visio
  '.wav': 'audio/wav', // Waveform Audio Format
  '.weba': 'audio/webm', // WEBM audio
  '.webm': 'video/webm', // WEBM video
  '.webp': 'image/webp', // WEBP image
  '.woff': 'font/woff', // Web Open Font Format (WOFF)
  '.woff2': 'font/woff2', // Web Open Font Format (WOFF)
  '.xhtml': 'application/xhtml+xml', // XHTML
  '.xls': 'application/vnd.ms-excel', // Microsoft Excel
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Microsoft Excel (OpenXML)
  '.xml': 'application/xml', // XML
  '.xul': 'application/vnd.mozilla.xul+xml', // XUL
  '.zip': 'application/zip', // ZIP archive
  '.3gp': 'video/3gpp', // 3GPP audio/video container audio/3gpp if it doesn't contain video
  '.3g2': 'video/3gpp2', // 3GPP2 audio/video container audio/3gpp2 if it doesn't contain video
  '.7z': 'application/x-7z-compressed' // 7-zip archive
};

P.convert.mime = function(fn) {
  var mime, ref, ref1, ref2, tp;
  if (fn == null) {
    fn = (ref = (ref1 = (ref2 = this.params.fn) != null ? ref2 : this.params.mime) != null ? ref1 : this.params.filename) != null ? ref : this.params.file;
  }
  // plus some programming languages with text/plain, useful for filtering on filenames
  tp = (fn.indexOf('.') === -1 ? fn : fn.substr(fn.lastIndexOf('.') + 1)).toLowerCase();
  if (tp === 'html') {
    tp = 'htm';
  }
  if (tp === 'jpeg') {
    tp = 'jpg';
  }
  if (tp === 'tiff') {
    tp = 'tif';
  }
  if (tp === 'midi') {
    tp = 'mid';
  }
  mime = P.convert._mimes['.' + tp];
  if (typeof mime === 'string') {
    return mime;
  } else {
    return false;
  }
};

P.convert.stream2txt = function(stream) {
  var chunks;
  chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      return chunks.push(Buffer.from(chunk));
    });
    stream.on('error', (err) => {
      return reject(err);
    });
    return stream.on('end', () => {
      return resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
};

// write examples of how to do various things here
if (S.example == null) {
  S.example = {};
}

S.example.example = 3;

P.example = function() {
  var res;
  res = {
    name: S.name,
    version: S.version,
    built: S.built
  };
  try {
    res.caller = (new Error()).stack.split("\n")[3].split('FetchEvent.')[1].split(' ')[0];
  } catch (error) {}
  try {
    res.fn = this.fn;
  } catch (error) {}
  if (S.dev) {
    try {
      if (res.headers == null) {
        res.headers = this.headers;
      }
    } catch (error) {}
    try {
      if (res.parts == null) {
        res.parts = this.parts;
      }
    } catch (error) {}
    try {
      if (res.params == null) {
        res.params = this.params;
      }
    } catch (error) {}
    try {
      if (res.opts == null) {
        res.opts = this.opts;
      }
    } catch (error) {}
  }
  return res;
};

P.example.restricted = function() {
  return {
    hello: this.user._id
  };
};

P.example.restricted._auth = true;

P.example.deep = async function() {
  var res;
  res = {
    example: 'deep',
    deeper: (await this.example.deep.deeper())
  };
  try {
    res.caller = (new Error()).stack.split("\n")[3].split('FetchEvent.')[1].split(' ')[0];
  } catch (error) {}
  try {
    res.fn = this.fn;
  } catch (error) {}
  return res;
};

P.example.deep.deeper = async function() {
  var res;
  res = {
    hello: 'deeper'
  };
  try {
    res.caller = (new Error()).stack.split("\n")[3].split('FetchEvent.')[1].split(' ')[0];
  } catch (error) {}
  try {
    res.fn = this.fn;
  } catch (error) {}
  try {
    res.deepest = (await this.example.deep.deeper.deepest());
  } catch (error) {}
  return res;
};

P.example.deep.deeper.deepest = function() {
  var res;
  res = {
    hello: 'deepest'
  };
  try {
    res.caller = (new Error()).stack.split("\n")[3].split('FetchEvent.')[1].split(' ')[0];
  } catch (error) {}
  try {
    res.fn = this.fn;
  } catch (error) {}
  return res;
};

P.example.inbetween = function() {
  // call a url like example/thing/inbetween and this should give you thing
  console.log(typeof this.params.example);
  return this.params;
};

// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

// NOTE TODO for getting certain file content, adding encoding: null to headers (or correct encoding required) is helpful
P.fetch = async function(url, params) {
  var _f, base, ct, i, j, k, len, len1, name, nu, pt, qp, ref, ref1, ref2, res, v;
  // TODO if asked to fetch a URL that is the same as the @url this worker served on, then needs to switch to a bg call if bg URL available
  if ((url == null) && (params == null)) {
    try {
      params = this.copy(this.params);
    } catch (error) {}
  }
  if (typeof url === 'object' && (params == null)) {
    params = url;
    url = params.url;
  }
  if (params == null) {
    params = {};
  }
  if (!url && params.url) {
    url = params.url;
    delete params.url;
  }
  if (params.bg === true && typeof S.bg === 'string') {
    params.url = url; // send to bg (e.g. for proxying)
    url = S.bg + '/fetch';
    delete params.bg;
  }
  // if params is provided, and headers is in it, may want to merge with some default headers
  // see below for other things that can be set
  if (params.username && params.password) {
    params.auth = params.username + ':' + params.password;
    delete params.username;
    delete params.password;
  }
  if (url.split('//')[1].split('@')[0].indexOf(':') !== -1) {
    params.auth = url.split('//')[1].split('@')[0];
    url = url.replace(params.auth + '@', '');
  }
  if (params.auth) {
    if (params.headers == null) {
      params.headers = {};
    }
    params.headers['Authorization'] = 'Basic ' + Buffer.from(params.auth).toString('base64'); // should be fine on node
    delete params.auth;
  }
  ref = ['data', 'content', 'json'];
  // where else might body content reasonably be?
  for (i = 0, len = ref.length; i < len; i++) {
    ct = ref[i];
    if (params[ct] != null) {
      params.body = params[ct];
      delete params[ct];
    }
  }
  if (params.body != null) {
    if (params.headers == null) {
      params.headers = {};
    }
    if ((params.headers['Content-Type'] == null) && (params.headers['content-type'] == null)) {
      params.headers['Content-Type'] = typeof params.body === 'object' ? 'application/json' : 'text/plain';
    }
    if ((ref1 = typeof params.body) === 'object' || ref1 === 'boolean' || ref1 === 'number') { // or just everything?
      params.body = JSON.stringify(params.body);
    }
    if (params.method == null) {
      params.method = 'POST';
    }
  }
  if (params.form != null) {
    // note, to send form and more data, form-data would be needed
    if (params.headers == null) {
      params.headers = {};
    }
    if ((params.headers['Content-Type'] == null) && (params.headers['content-type'] == null)) {
      params.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (typeof params.form === 'string') {
      params.body = params.form;
    } else {
      try {
        params.form = (await this.params(params.form));
      } catch (error) {}
    }
    delete params.form;
    if (params.method == null) {
      params.method = 'POST';
    }
  }
  if (typeof url !== 'string') {
    return false;
  } else {
    try {
      if (url.indexOf('?') !== -1) {
        nu = url.split('?')[0] + '?';
        ref2 = url.split('?')[1].split('&');
        for (j = 0, len1 = ref2.length; j < len1; j++) {
          qp = ref2[j];
          if (!nu.endsWith('?')) {
            nu += '&';
          }
          [k, v] = qp.split('=');
          if (v == null) {
            v = '';
          }
          nu += k + '=' + (v.indexOf('%') !== -1 ? v : encodeURIComponent(v));
        }
        url = nu;
      }
    } catch (error) {}
    if (S.system && ((typeof S.bg === 'string' && url.startsWith(S.bg)) || (typeof S.kv === 'string' && S.kv.startsWith('http') && url.startsWith(S.kv)))) {
      if (params.headers == null) {
        params.headers = {};
      }
      if ((base = params.headers)[name = 'x-' + S.name + '-system'] == null) {
        base[name] = S.system;
      }
    }
    _f = async() => {
      var hd, l, len2, len3, m, r, ref3, ref4, resp, response, rk, verbose;
      if (params.verbose) {
        verbose = true;
        delete params.verbose;
      } else {
        verbose = false;
      }
      try {
        if (url.indexOf('localhost') !== -1) {
          // allow local https connections on backend server without check cert
          if (params.agent == null) {
            params.agent = new https.Agent({
              rejectUnauthorized: false
            });
          }
        }
      } catch (error) {}
      response = (await fetch(url, params));
      if (S.dev) { //and S.bg is true # status code can be found here
        console.log(response.status + ' ' + url);
      }
      // content type could be read from: response.headers.get('content-type')
      // and await response.json() can get json direct, but it will error if the wrong sort of data is provided.
      // So just do it manually from text here if appropriate
      // TODO what if the response is a stream (buffer)?
      r = (await response.text());
      try {
        if (typeof r === 'string' && (r.indexOf('{') === 0 || r.indexOf('[') === 0)) {
          r = JSON.parse(r);
        }
      } catch (error) {}
      resp = {};
      if (response.status === 404) {
        resp = void 0;
      } else if (response.status >= 400) {
        if (S.dev) {
          console.log(JSON.stringify(r));
          console.log('ERROR ' + response.status);
        }
        resp.status = response.status;
      } else if (verbose) {
        if (typeof r === 'object') {
          resp.json = r;
        } else {
          resp.text = r;
        }
      } else {
        resp = r;
      }
      if (verbose && typeof resp === 'object') {
        resp.headers = {};
        ref3 = [...response.headers];
        for (l = 0, len2 = ref3.length; l < len2; l++) {
          hd = ref3[l];
          resp.headers[hd[0]] = hd[1];
        }
        ref4 = ['status', 'ok', 'redirected', 'bodyUsed'];
        // size, timeout url, statusText, clone, body, arrayBuffer, blob, json, text, buffer, textConverted
        for (m = 0, len3 = ref4.length; m < len3; m++) {
          rk = ref4[m];
          resp[rk] = response[rk];
        }
      }
      if (verbose && (resp != null) && ((this != null ? this.fn : void 0) != null) && this.fn === 'fetch' && this.parts.length === 1 && this.parts[0] === 'fetch') {
        return {
          status: 200,
          body: resp
        };
      } else {
        return resp;
      }
    };
    `if params.retry
  params.retry = 3 if params.retry is true
  opts = retry: params.retry
  delete params.retry
  for rk in ['pause', 'increment', 'check', 'timeout']
    if params[rk]?
      opts[rk] = params[rk]
      delete params[rk]
  res = @retry.call this, _f, [url, params], opts
else`;
    if (params.timeout && ((this != null ? this._timeout : void 0) != null)) {
      pt = params.timeout === true ? 30000 : params.timeout;
      delete params.timeout;
      res = (await this._timeout(pt, _f()));
    } else {
      res = (await _f());
    }
    try {
      res = res.trim();
      if (res.indexOf('[') === 0 || res.indexOf('{') === 0) {
        res = JSON.parse(res);
      }
    } catch (error) {}
    return res;
  }
};

if (S.log == null) {
  S.log = {};
}

// it would also be good to log every fetch, and what was sent with it too, although if it was a big file or something like that, then not that
// what about a param to pass to avoid logging?
P.log = async function(msg, store) {
  var i, indexed, j, l, len, len1, mid, p, prev, ref, ref1, ref2;
  if (this.S.log !== false) {
    if (store !== true) { // an empty call to log stores everything in the _logs list
      store = msg == null;
    }
    if (typeof msg === 'string') {
      if (msg.indexOf('/') !== -1 && msg.indexOf(' ') === -1) {
        msg = {
          fn: msg
        };
      } else {
        msg = {
          msg: msg
        };
      }
    } else if (Array.isArray(msg)) {
      for (i = 0, len = msg.length; i < len; i++) {
        l = msg[i];
        this._logs.push(l);
      }
      msg = void 0;
    }
    if (msg == null) {
      if (this.parts.length === 1 && this.parts[0] === 'log') { // should a remote log be allowed to send to a sub-route URL as an ID? maybe with particular auth?
        // receive a remote log
        msg = typeof this.body === 'object' ? {
          logs: this.body
        } : this.params; // bunch of logs sent in as POST body, or else just params
        if (msg.fn == null) {
          msg.fn = this.params.log; // the fn, if any, would be in params.log (because @fn would just be log)
        }
      }
      if (msg == null) {
        msg = {};
      }
      try {
        msg.request = {
          url: this.request.url,
          method: this.request.method
        };
      } catch (error) {}
      try {
        msg.request.body = this.body != null;
      } catch (error) {}
      try {
        msg.request.cf = {
          colo: this.request.cf.colo,
          country: this.request.cf.country
        };
      } catch (error) {}
      try {
        msg.request.headers = this.headers; // just get all headers to see what's useful?
      } catch (error) {}
      try {
        if ((msg.fn == null) && (this.fn != null)) {
          //catch
          //try
          //  msg.request.headers = {}
          //  msg.headers.ip = (@headers['x-forwarded-for'] ? @headers['x-real-ip']) if @headers['x-real-ip'] or @headers['x-forwarded-for']
          //  msg.headers['user-agent'] = @headers['user-agent'] if @headers['user-agent']
          //  msg.headers.referer = @headers.referer if @headers.referer
          msg.fn = this.fn;
        }
        if (this.refresh) {
          msg.refresh = this.refresh;
        }
        msg.parts = this.parts;
        if (this.completed) {
          msg.completed = this.completed;
        }
        if (this.cached) {
          msg.cached = this.cached;
        }
      } catch (error) {}
      try {
        // don't stringify the whole obj, allow individual keys, but make them all strings to avoid mapping clashes
        msg.params = {};
        for (p in this.params) {
          msg.params[p] = typeof this.params[p] === 'string' ? this.params[p] : JSON.stringify(this.params[p]);
        }
      } catch (error) {}
      try {
        msg.apikey = (this.headers.apikey != null) || (this.headers['x-apikey'] != null);
      } catch (error) {}
      try {
        if (((ref = this.user) != null ? ref._id : void 0) != null) {
          msg.user = this.user._id;
        }
      } catch (error) {}
      if (this.unauthorised) {
        msg.unauthorised = true;
      }
    } else if (typeof msg === 'object' && msg.res && msg.args) { // this indicates the fn had _diff true
      // find a previous log for the same thing and if it's different add a diff: true to the log of this one. Or diff: false if same, to track that it was diffed
      try {
        prev = (await this.index('log', 'args:"' + msg.args)); // TODO what if it was a diff on a main log event though? do all log events have child log events now? check. and check what args/params should be compared for diff
        msg.diff = prev.hits.hits[0]._source.res !== msg.res;
      } catch (error) {}
    }
    // if msg.diff, send an email alert? Or have schedule pick up on those later?
    if (store) {
      if (!msg.logs) {
        msg.logs = [];
        if (Array.isArray(this != null ? this._logs : void 0) && this._logs.length) {
          ref1 = this._logs;
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            l = ref1[j];
            if (l.alert) {
              //msg.msg ?= l.msg
              if (msg.alert == null) {
                msg.alert = l.alert;
              }
            }
            if (l.notify) {
              if (msg.notify == null) {
                msg.notify = l.notify;
              }
            }
            msg.logs.push(l);
          }
        }
      }
      msg.createdAt = new Date(); //Date.now()
      if (msg.name == null) {
        msg.name = S.name;
      }
      if (msg.version == null) {
        msg.version = S.version;
      }
      msg.base = this.base;
      if (this.domain) {
        msg.domain = this.domain;
      }
      if (this.S.bg === true) {
        msg.bg = true;
      }
      if (this.system === true) {
        msg.system = true;
      }
      if (this.scheduled === true) {
        msg.scheduled = true;
      }
      try {
        msg.started = this.started;
        msg.took = Date.now() - this.started;
      } catch (error) {}
      mid = 'log/' + ((ref2 = this.rid) != null ? ref2 : (await this.uid()));
      if (this.S.bg === true || this.S.kv === false) {
        if (!(indexed = (await this.index(mid, msg)))) {
          await this.index('log', {});
          return this.index(mid, msg);
        }
      } else {
        return this.kv(mid, msg);
      }
    } else {
      return this._logs.push(msg);
    }
  } else if (this.S.dev && this.S.bg === true) {
    return console.log(msg);
  }
};

P.log.clear = function() {
  // this is just for manual log removal on dev
  if (this.S.dev) {
    return this.kv._each('log', '');
  }
};

P.log.clear._hidden = true;

// a user should be able to set a list of endpoints they want to receive notifications for
// could also wildcard* match
// note if there are lots of notifications, may need to group them
// user won't need auth for the endpoint because it won't give any info about the result - just that it happened?
// or if results are wanted, auth for the endpoint would be necessary
// notifications from this will go to a google chat bot webhook
// notifications will be triggered by log analysis, a scheduled job will need to check through them
`P.log.monitor = (opts) ->
  opts ?= @params
  if (opts.email or opts.chat) and opts.q
    opts.q = JSON.stringify(opts.q) if typeof opts.q isnt 'string'
    opts.frequency ?= 60
    # also can provide an opts.name as a nice name for the monitor instead if just the query
    return opts
  return undefined
P.log.monitor = _index: true
P.log.monitor._schedule = () ->
  notify = {}
  chat = []
  counter = 0
  await @index._each 'log_monitor', '*', (rec) ->
    if not rec.notified or rec.notified + (rec.frequency * 60000) < @started
      rec.notified = @started
      @waitUntil @index 'log_monitor/' + rec._id, @copy rec
      q = if typeof rec.q is 'string' and rec.q.startsWith('{') then JSON.parse(rec.q) else rec.q
      q = await @index.translate q, { newest: true, restrict: [{query_string: {query: 'createdAt:>' + (@started - (rec.frequency * 60000))}}]}
      count = await @index.count 'log', undefined, q
      if count
        counter += count
        rec.dq = q
        rec.count = count
        if rec.email
          notify.email ?= []
          notify.email.push rec
        if rec.chat
          chat.push rec

  for e of notify
    txt = ''
    for n in notify[e]
      txt += 'https://bg' + (if @S.dev then 'b' else '') + '.lvatn.com/log?q=' + JSON.stringify(n.dq) + '\n\n'
    @waitUntil @mail.send
      to: notify[e].email
      subject: notify[e].length + ' of your monitors have ' + rec.count + ' new alerts'
      text: txt
  
  if chat.length
    txt = chat.length + ' monitor notifications:'
    for c in chat
      txt += '\nhttps://bg' + (if @S.dev then 'b' else '') + '.lvatn.com/log?q=' + JSON.stringify(c.dq)
    @waitUntil @src.google.chat txt
  
  return counter`;

`P.add 'mail/feedback/:token',
  get: () ->
    try
      from = this.queryParams.from ? P.settings.mail?.feedback?[this.urlParams.token]?.from ? "sysadmin@cottagelabs.com"
      to = P.settings.mail?.feedback?[this.urlParams.token]?.to
      service = P.settings.mail?.feedback?[this.urlParams.token]?.service
      subject = P.settings.mail?.feedback?[this.urlParams.token]?.subject ? "Feedback"
    if to?
      P.mail.send
        service: service
        from: from
        to: to
        subject: subject
        text: this.queryParams.content
    return {}


level/loglevel
group (default to whatever is after svc or src, or just part 0)
notify/alert

P.log = (opts, fn, lvl='debug') ->

    loglevels = ['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'off']
    loglevel = P.settings.log?.level ? 'all'
    if loglevels.indexOf(loglevel) <= loglevels.indexOf opts.level
      if opts.notify and P.settings.log?.notify
        try
          os = @copy opts
        catch
          os = opts
        Meteor.setTimeout (() -> P.notify os), 100

      for o of opts
        if not opts[o]?
          delete opts[o]
        else if typeof opts[o] isnt 'string' and not _.isArray opts[o]
          try
            opts[o] = JSON.stringify opts[o]
          catch
            try
              opts[o] = opts[o].toString()
            catch
              delete opts[o]

      if loglevels.indexOf(loglevel) <= loglevels.indexOf 'debug'
        console.log opts.msg if opts.msg

  if typeof notify is 'string'
    if note.indexOf '@' isnt -1
      note = to: note

  if typeof note is 'object'
    note.text ?= note.msg ? opts.msg
    note.subject ?= P.settings.name ? 'API log message'
    note.from ?= P.settings.log?.from ? 'alert@cottagelabs.com'
    note.to ?= P.settings.log?.to ? 'mark@cottagelabs.com'
    P.mail.send note




P.ping = (url,shortid) ->
  return false if not url?
  url = 'http://' + url if url.indexOf('http') isnt 0
  if (not shortid? or shortid is 'random') and spre = pings.find {url:url,redirect:true}
    return spre._id
  else
    obj = {url:url,redirect:true}
    if shortid? and shortid isnt 'random'
      while already = pings.get shortid
        shortid += Random.hexString(2)
      obj._id = shortid
    return pings.insert obj

# craft an img link and put it in an email, if the email is viewed as html it will load the URL of the img,
# which actually hits this route, and allows us to record stuff about the event

# so for example for oabutton where this was first created for, an image url like this could be created,
# with whatever params are required to be saved, in addition to the nonce.
# On receipt the pinger will grab IP and try to retrieve location data from that too:
# <img src="https://api.cottagelabs.com/ping/p.png?n=<CURRENTNONCE>service=oabutton&id=<USERID>">

P.ping.png = () ->
  if not P.settings.ping?.nonce? or this.queryParams.n is P.settings.ping.nonce
    data = this.queryParams
    delete data.n
    data.ip = this.request.headers['x-forwarded-for'] ? this.request.headers['cf-connecting-ip'] ? this.request.headers['x-real-ip']
    data.forwarded = this.request.headers['x-forwarded-for']
    try
      res = HTTP.call 'GET', 'http://ipinfo.io/' + data.ip + (if P.settings?.use?.ipinfo?.token? then '?token=' + P.settings.use.ipinfo.token else '')
      info = JSON.parse res.content
      data[k] = info[k] for k of info
      if data.loc
        try
          latlon = data.loc.split(',')
          data.lat = latlon[0]
          data.lon = latlon[1]
    pings.insert data
  img = new Buffer('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4z8BQDwAEgAF/posBPQAAAABJRU5ErkJggg==', 'base64');
  if this.queryParams.red
    img = new Buffer('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64')
  this.response.writeHead 200,
    'Content-disposition': "inline; filename=ping.png"
    'Content-type': 'image/png'
    'Content-length': img.length
    'Access-Control-Allow-Origin': '*'

    this.response.end img

P.add 'ping/:shortid',
  get: () ->
    if this.urlParams.shortid is 'random' and this.queryParams.url
      # may want to disbale this eventually as it makes it easy to flood the server, if auth is added on other routes
      return P.ping this.queryParams.url, this.urlParams.shortid
    else if exists = pings.get(this.urlParams.shortid) and exists.url?
        count = exists.count ? 0
        count += 1
        pings.update exists._id, {count:count}
        return
          statusCode: 302
          headers:
            'Content-Type': 'text/plain'
            'Location': exists.url
          body: 'Location: ' + exists.url
    else return 404
  put:
    authRequired: true
    action: () ->
      # certain user groups can overwrite a shortlink
      # TODO: overwrite a short link ID that already exists, or error out
  post: () ->
    return P.ping (this.request.body.url ? this.queryParams.url), this.urlParams.shortid
  delete:
    #authRequired: true
    action: () ->
      if exists = pings.get this.urlParams.shortid
        pings.remove exists._id
        return true
      else
        return 404`;

try {
  S.mail = JSON.parse(SECRETS_MAIL);
} catch (error) {
  S.mail = {};
}

P.mail = async function(opts) {
  var f, fo, ms, p, parts, ref, ref1, ref10, ref11, ref12, ref13, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, url;
  if ((ref = S.mail) != null ? ref.disabled : void 0) {
    return {};
  }
  if (typeof opts === 'string') {
    opts = {
      text: opts
    };
  }
  if (opts == null) {
    opts = (ref1 = this.copy(this != null ? this.params : void 0)) != null ? ref1 : {};
  }
  if (opts.template) {
    parts = (await this.template(opts.template, (ref2 = (ref3 = opts.vars) != null ? ref3 : opts.params) != null ? ref2 : opts));
    for (p in parts) {
      opts[p] = parts[p];
    }
    delete opts.template;
    delete opts.vars;
    delete opts.params;
  }
  if (!opts.text && !opts.html) {
    opts.text = (ref4 = (ref5 = (ref6 = (ref7 = opts.content) != null ? ref7 : opts.msg) != null ? ref6 : opts.body) != null ? ref5 : this.body) != null ? ref4 : '';
    if (typeof opts.text === 'object') {
      try {
        opts.text = (await this.convert.json2html(opts.text));
      } catch (error) {
        opts.text = JSON.stringify(opts.text);
      }
    }
  }
  delete opts.content;
  delete opts.body;
  if (!opts.html && typeof opts.text === 'string' && opts.text.indexOf('<') !== -1 && opts.text.indexOf('>') !== -1) {
    opts.html = opts.text;
  }
  // can also take opts.headers
  // also takes opts.attachments, but not required. Should be a list of objects
  // how do attachments work if not on mail_url, can they be sent by API?
  // https://github.com/nodemailer/mailcomposer/blob/v4.0.1/README.md#attachments
  // could use mailgun-js, but prefer to just send direct to API
  ms = (opts.svc || opts.service) && (((ref8 = this.S.svc[(ref9 = opts.svc) != null ? ref9 : opts.service]) != null ? ref8.mail : void 0) != null) ? this.S.svc[(ref10 = opts.svc) != null ? ref10 : opts.service].mail : (ref11 = this != null ? (ref12 = this.S) != null ? ref12.mail : void 0 : void 0) != null ? ref11 : S.mail;
  if (opts.from == null) {
    opts.from = ms.from;
  }
  if (opts.to == null) {
    opts.to = ms.to;
  }
  delete opts.svc;
  url = 'https://api.mailgun.net/v3/' + ms.domain + '/messages';
  if (Array.isArray(opts.to)) {
    opts.to = opts.to.join(',');
  }
  f = (ref13 = this != null ? this.fetch : void 0) != null ? ref13 : P.fetch;
  fo = (await this.form(opts));
  return (await f(url, {
    method: 'POST',
    form: fo,
    auth: 'api:' + ms.apikey
  }));
};

P.mail.validate = async function(e, apikey) {
  var ns, nsp, ref, ref1, v;
  //apikey ?= @S.mail?.pubkey
  if (e == null) {
    e = this != null ? (ref = this.params) != null ? ref.email : void 0 : void 0;
  }
  if (typeof e === 'string' && e.length && (e.indexOf(' ') === -1 || (e.startsWith('"') && e.split('"@').length === 2))) {
    try {
      if (typeof apikey === 'string') {
        v = (await this.fetch('https://api.mailgun.net/v3/address/validate?syntax_only=false&address=' + encodeURIComponent(e) + '&api_key=' + apikey));
        return (ref1 = v.did_you_mean) != null ? ref1 : v.is_valid;
      }
    } catch (error) {}
    //(?:[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&amp;'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])
    ns = e.split('@');
    if (ns.length === 2 && ns[0].length && ns[0].length < 65 && ((ns[0].startsWith('"') && ns[0].endsWith('"')) || (ns[0].indexOf(' ') === -1 && ns[0].indexOf(',') === -1 && ns[0].indexOf(':') === -1 && ns[0].indexOf(';') === -1))) {
      if (ns[1].length && ns[1].indexOf(',') === -1 && ns[1].indexOf(' ') === -1) {
        nsp = ns[1].split('.');
        if (nsp.length > 1 && (nsp.length !== 2 || nsp[0] !== 'example')) {
          return true;
        }
      }
    }
  }
  return false;
};

var base, base1, base2;

if (S.mail == null) {
  S.mail = {};
}

if ((base = S.mail).from == null) {
  base.from = "alert@cottagelabs.com";
}

if ((base1 = S.mail).to == null) {
  base1.to = "mark@cottagelabs.com";
}

if ((base2 = S.src).google == null) {
  base2.google = {};
}

try {
  S.src.google.secrets = JSON.parse(SECRETS_GOOGLE);
} catch (error) {}

P.status = async function() {
  var i, j, k, len, len1, ref, ref1, res;
  res = {
    name: S.name,
    version: S.version,
    built: S.built
  };
  ref = ['uid', 'rid', 'params', 'base', 'parts', 'opts', 'routes'];
  for (i = 0, len = ref.length; i < len; i++) {
    k = ref[i];
    try {
      if (res[k] == null) {
        res[k] = this[k];
      }
    } catch (error) {}
  }
  if (this.S.bg === true) {
    res.bg = true;
  }
  res.kv = typeof this.S.kv === 'string' && global[this.S.kv] ? this.S.kv : typeof this.S.kv === 'string' ? this.S.kv : false;
  if ((await this.index(''))) {
    res.index = true;
  }
  if (S.dev) {
    if (this.S.bg !== true) {
      try {
        res.request = this.request;
      } catch (error) {}
    }
    ref1 = ['headers', 'cookie', 'user'];
    for (j = 0, len1 = ref1.length; j < len1; j++) {
      k = ref1[j];
      try {
        if (res[k] == null) {
          res[k] = this[k];
        }
      } catch (error) {}
    }
  }
  
  // maybe useful things like how many accounts, how many queued jobs etc - prob just get those from status endpoints on the stack
  // maybe some useful info from the recent logs too
  return res;
};

`
import fs from 'fs'

P.structure = (src) ->
  collections = []
  methods = {}
  settings = {}
  called = {}
  TODO = {}

  method = {}
  incomment = false
  inroute = false
  for l of lns = fs.readFileSync(src).toString().replace(/\r\n/g,'\n').split '\n'
    line = lns[l].replace /\t/g, '  '
    if JSON.stringify(method) isnt '{}' and (l is '0' or parseInt(l) is lns.length-1 or (line.indexOf('P.') is 0 and line.indexOf('>') isnt -1))
      method.code = method.code.trim()
      if method.name.indexOf('P.') is 0
        methods[method.name] = method
      method = {}

    if line.indexOf('S.') isnt -1
      stng = (if line.indexOf('@S.') isnt -1 then '@S.' else 'S.') + line.split('S.')[1].split(' ')[0].split(')')[0].split('}')[0].split(',')[0].split('.indexOf')[0].replace(/[^a-zA-Z0-9\.\[\]]/g,'').replace /\.$/, ''
      if stng.split('.').length > 1
        if method.name
          method.settings ?= []
          method.settings.push(stng) if stng not in method.settings
        settings.push(stng) if stng not in settings

    if line.indexOf('P.') is 0
      inroute = line.split(' ')[1].split(',')[0].replace(/'/g,'').replace(/"/g,'')
      if inroute.split('/').pop() is 'test'
        inroute = false
      else
        routes[inroute] ?= {methods: [], code: ''}

    if line.toLowerCase().indexOf('todo') isnt -1
      TODO[method.name ? 'GENERAL'] ?= []
      TODO[method.name ? 'GENERAL'].push line.split(if line.indexOf('todo') isnt -1 then 'todo' else 'TODO')[1].trim()
    if incomment or not line.length
      # TODO these line index and trims should have three single quotes inside the doubles, which breaks parsing while commented out, so removing for now
      if line.indexOf("") isnt -1
        incomment = false
    else if line.trim().startsWith('#') or line.trim().startsWith("")
      if line.trim().startsWith("")
        incomment = true
    else if line.indexOf('P.') is 0 or (not line.startsWith(' ') and line.indexOf('=') isnt -1)
      inroute = false
      method = {}
      method.code = line
      method.name = line.split(' ')[0]
      method.group = if method.name.indexOf('svc.') isnt -1 then method.name.split('svc.')[1].split('.')[0] else if method.name.indexOf('src.') isnt -1 then method.name.split('src.')[1].split('.')[0] else if method.name.indexOf('P.') is 0 then method.name.replace('P.','').split('.')[0] else undefined
      method.args = if line.indexOf('(') is -1 then [] else line.split('(')[1].split(')')[0].split(',')
      for a of method.args
        method.args[a] = method.args[a].trim()
      method.calls = []
      method.remotes = []
    else if inroute
      routes[inroute].code += (if routes[inroute].code then '\n' else '') + line
      if line.indexOf('P.') isnt -1
        rtm = line.replace('P.','')
        if rtm.indexOf('P.') isnt -1
          rtmc = 'P.' + rtm.split('P.')[1].split(' ')[0].split('(')[0].replace(/[^a-zA-Z0-9\.\[\]]/g,'').replace(/\.$/,'')
          routes[inroute].methods.push(rtmc) if rtmc.length and rtmc.split('.').length > 1 and rtmc not in routes[inroute].methods
    else if method.name?
      method.code += '\n' + line
      li = line.indexOf 'P.'
      if li isnt -1
        parts = line.split 'P.'
        parts.shift()
        for p in parts
          p = if tp is 'P.' then tp + p.split(' ')[0].split('(')[0].split(')')[0].trim() else p.trim().replace('call ','').replace('call(','')
          if tp is 'P.' and p not in method.calls
            if p.indexOf('?') is -1
              pt = p.replace(/[^a-zA-Z0-9\.\[\]]/g,'').replace(/\.$/,'')
              if pt.length and pt.split('.').length > 1 and pt not in method.calls
                method.calls.push pt
                called[pt] ?= []
                called[pt].push method.name

  for rk in @keys(routes).sort()
    for mt in routes[rk].methods
      if methods[mt]? and (not methods[mt].routes? or rk not in methods[mt].routes)
        methods[mt].routes ?= []
        methods[mt].routes.push rk
  for cl of called
    methods[cl].called = called[cl].sort() if methods[cl]? # where are the missing ones? in collections?
  
  res = count: @keys(methods).length, collections: collections.sort(), methods: methods, routes: routes, TODO: TODO
  res = P.structure.nodeslinks res
  return res

P.structure.groups = () ->
  sr = API.structure.read()
  return sr.groups ? API.structure.nodeslinks().groups

P.structure.nodeslinks = (sr, group) ->
  sr ?= P.structure()
  positions = {}
  counters = {}
  nds = []
  groups = []
  colls = {}
  for m of sr.methods
    method = sr.methods[m]
    rec = {}
    rec.key = method.name
    counters[rec.key] = 1
    rec.group = method.group
    groups.push(rec.group) if rec.group not in groups
    rec.calls = method.calls
    rec.collections = method.collections
    nds.push rec
    positions[rec.key] = nds.length-1
    for c of method.collections
      colls[c] ?= []
      for pc in method.collections[c]
        apc = 'API.collection.prototype.' + pc
        colls[c].push(apc) if apc not in colls[c]

  lns = []
  extras = []
  esp = {}
  nl = nds.length
  for n of nds
    node = nds[n]
    for c in node.calls ? []
      if not counters[c]
        counters[c] = 1
      else if not group or c.indexOf('.'+group) isnt -1
        counters[c] += 1
      pos = positions[c]
      if not pos?
        pos = esp[c]
      if not pos?
        extras.push {key: c, group: 'MISSING'}
        esp[c] = extras.length-1
        pos = nl + extras.length - 2
      if (not group or c.indexOf('.'+group) isnt -1 or node.group is group)
        lns.push {source: parseInt(n), target: pos}
    for co of node.collections ? {}
      if not counters[co]
        counters[co] = 1
      else if not group or c.indexOf('.'+group) isnt -1
        counters[co] += 1
      if not group or co.indexOf('.'+group) isnt -1 or node.group is group or group in ['collection','collections','es']
        lns.push {source: parseInt(n), target: positions[co]}

  for e of extras
    nds.push extras[e]

  for nd of nds
    cv = counters[nds[nd].key] ? 1
    nds[nd].value = cv
    nds[nd].size = cv

  sr.nodecount ?= nds.length
  sr.linkcount ?= lns.length
  sr.nodes ?= nds
  sr.links ?= lns
  sr.groups ?= groups.sort()

  return sr`;

var indexOf = [].indexOf;

P.tdm = {};

P.tdm.occurrence = function(content, sub, overlap) {
  var n, pos, ref, ref1, ref2, ref3, ref4, ref5, ref6, step;
  if (content == null) {
    content = (ref = this != null ? (ref1 = this.params) != null ? ref1.content : void 0 : void 0) != null ? ref : this != null ? (ref2 = this.params) != null ? ref2.url : void 0 : void 0;
  }
  if (content.indexOf('http') === 0) {
    content = this.fetch(content);
  }
  if (sub == null) {
    sub = (ref3 = this != null ? (ref4 = this.params) != null ? ref4.sub : void 0 : void 0) != null ? ref3 : this != null ? (ref5 = this.params) != null ? ref5.q : void 0 : void 0;
  }
  if (overlap == null) {
    overlap = this != null ? (ref6 = this.params) != null ? ref6.overlap : void 0 : void 0;
  }
  content += "";
  sub += "";
  if (sub.length <= 0) {
    return content.length + 1;
  }
  n = 0;
  pos = 0;
  step = overlap ? 1 : sub.length;
  while (true) {
    pos = content.indexOf(sub, pos);
    if (pos >= 0) {
      ++n;
      pos += step;
    } else {
      break;
    }
  }
  return n;
};

P.tdm.levenshtein = function(a, b, lowercase) {
  var c, cost, i, j, m, minimator, n, o, r, ref, ref1, ref2, ref3;
  if (a == null) {
    a = this != null ? (ref = this.params) != null ? ref.a : void 0 : void 0;
  }
  if (b == null) {
    b = this != null ? (ref1 = this.params) != null ? ref1.b : void 0 : void 0;
  }
  if (lowercase == null) {
    lowercase = (ref2 = this != null ? (ref3 = this.params) != null ? ref3.lowercase : void 0 : void 0) != null ? ref2 : true;
  }
  if (lowercase) {
    a = a.toLowerCase();
    b = b.toLowerCase();
  }
  minimator = function(x, y, z) {
    if (x <= y && x <= z) {
      return x;
    }
    if (y <= x && y <= z) {
      return y;
    }
    return z;
  };
  m = a.length;
  n = b.length;
  if (m < n) {
    c = a;
    a = b;
    b = c;
    o = m;
    m = n;
    n = o;
  }
  r = [[]];
  c = 0;
  while (c < n + 1) {
    r[0][c] = c;
    c++;
  }
  i = 1;
  while (i < m + 1) {
    r[i] = [i];
    j = 1;
    while (j < n + 1) {
      cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      r[i][j] = minimator(r[i - 1][j] + 1, r[i][j - 1] + 1, r[i - 1][j - 1] + cost);
      j++;
    }
    i++;
  }
  return {
    distance: r[r.length - 1][r[r.length - 1].length - 1],
    length: {
      a: m,
      b: n //, detail: r
    }
  };
};


// https://en.wikipedia.org/wiki/Hamming_distance#Algorithm_example
// this is faster than levenshtein but not always so useful
// this works slightly better with perceptual hashes, or anything where just need to know how many changes to make to become the same
// for example the levenshtein difference between 1234567890 and 0123456789 is 2
// whereas the hamming distance is 10
P.tdm.hamming = function(a, b, lowercase) {
  var c, diff, k, long, moves, pc, pos, ref, ref1, ref2, ref3, short, sl, ss;
  if (a == null) {
    a = this != null ? (ref = this.params) != null ? ref.a : void 0 : void 0;
  }
  if (b == null) {
    b = this != null ? (ref1 = this.params) != null ? ref1.b : void 0 : void 0;
  }
  if (lowercase == null) {
    lowercase = (ref2 = this != null ? (ref3 = this.params) != null ? ref3.lowercase : void 0 : void 0) != null ? ref2 : true;
  }
  if (lowercase) {
    a = a.toLowerCase();
    b = b.toLowerCase();
  }
  if (a.length < b.length) {
    short = a;
    long = b;
  } else {
    short = b;
    long = a;
  }
  pos = long.indexOf(short);
  ss = short.split('');
  sl = long.split('');
  if (sl.length > ss.length) {
    diff = sl.length - ss.length;
    if (0 < pos) {
      pc = 0;
      while (pc < pos) {
        ss.unshift('');
        pc++;
        diff--;
      }
    }
    c = 0;
    while (c < diff) {
      ss.push('');
      c++;
    }
  }
  moves = 0;
  for (k in sl) {
    if (ss[k] !== sl[k]) {
      moves++;
    }
  }
  return moves;
};

P.tdm.extract = function(opts) {
  var l, lastslash, len, m, match, mopts, mr, parts, ref, ref1, res, text;
  // opts expects url,content,matchers (a list, or singular "match" string),start,end,convert,format,lowercase,ascii
  if (opts.url && !opts.content) {
    if (opts.url.indexOf('.pdf') !== -1 || opts.url.indexOf('/pdf') !== -1) {
      if (opts.convert == null) {
        opts.convert = 'pdf';
      }
    } else {
      opts.content = P.http.puppeteer(opts.url, true);
    }
  }
  try {
    text = opts.convert ? P.convert.run((ref = opts.url) != null ? ref : opts.content, opts.convert, 'txt') : opts.content;
  } catch (error) {
    text = opts.content;
  }
  if (opts.matchers == null) {
    opts.matchers = [opts.match];
  }
  if (opts.start != null) {
    parts = text.split(opts.start);
    text = parts.length > 1 ? parts[1] : parts[0];
  }
  if (opts.end != null) {
    text = text.split(opts.end)[0];
  }
  if (opts.lowercase) {
    text = text.toLowerCase();
  }
  if (opts.ascii) {
    text = text.replace(/[^a-z0-9]/g, '');
  }
  if (opts.spaces === false) {
    text = text.replace(/ /g, '');
  }
  res = {
    length: text.length,
    matched: 0,
    matches: [],
    matchers: opts.matchers,
    text: text
  };
  if (text && typeof text !== 'number') {
    ref1 = opts.matchers;
    for (l = 0, len = ref1.length; l < len; l++) {
      match = ref1[l];
      mopts = 'g';
      if (opts.lowercase) {
        mopts += 'i';
      }
      if (match.indexOf('/') === 0) {
        lastslash = match.lastIndexOf('/');
        if (lastslash + 1 !== match.length) {
          mopts = match.substring(lastslash + 1);
          match = match.substring(1, lastslash);
        }
      } else {
        match = match.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
      }
      m;
      mr = new RegExp(match, mopts);
      while (m = mr.exec(text)) {
        res.matched += 1;
        res.matches.push({
          matched: match,
          result: m
        });
      }
    }
  }
  return res;
};

P.tdm.emails = function(opts = {}) {
  var checked, emails, ex, l, len, len1, p, pm, pmr, ref, ref1, ref2, ref3, ref4, ref5;
  opts.matchers = ['/([^ \'">{}/]*?@[^ \'"{}<>]*?[.][a-z.]{2,}?)/gi', '/(?: |>|"|\')([^ \'">{}/]*?@[^ \'"{}<>]*?[.][a-z.]{2,}?)(?: |<|"|\')/gi'];
  emails = [];
  checked = [];
  ex = P.tdm.extract(opts);
  ref = ex.matches;
  for (l = 0, len = ref.length; l < len; l++) {
    pm = ref[l];
    ref1 = pm.result;
    for (p = 0, len1 = ref1.length; p < len1; p++) {
      pmr = ref1[p];
      if (indexOf.call(checked, pmr) < 0) {
        if (typeof (((ref2 = P.mail) != null ? ref2.validate : void 0) != null) !== 'function' || P.mail.validate(pmr, (ref3 = P.settings.service) != null ? (ref4 = ref3.openaccessbutton) != null ? (ref5 = ref4.mail) != null ? ref5.pubkey : void 0 : void 0 : void 0).is_valid) {
          emails.push(pmr);
        }
      }
      checked.push(pmr);
    }
  }
  return emails;
};

P.tdm.stopwords = function(stops, more, gramstops = true) {
  var g, l, len, len1, m, p;
  
  // removed wordpos option from this
  if (stops == null) {
    stops = ['purl', 'w3', 'http', 'https', 'ref', 'html', 'www', 'ref', 'cite', 'url', 'title', 'date', 'nbsp', 'doi', 'fig', 'figure', 'supplemental', 'year', 'time', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'keywords', 'revised', 'accepted', 'file', 'attribution', 'org', 'com', 'id', 'wp', 'main', 'website', 'blogs', 'media', 'people', 'years', 'made', 'location', 'its', 'asterisk', 'called', 'xp', 'er', 'image', 'jpeg', 'jpg', 'png', 'php', 'object', 'false', 'true', 'article', 'chapter', 'book', 'caps', 'isbn', 'scale', 'axis', 'accessed', 'email', 'e-mail', 'story', 'first1', 'first2', 'last1', 'last2', 'general', 'list', 'accessdate', 'view_news', 'd0', 'dq', 'sfnref', 'onepage', 'sfn', 'authorlink'];
  }
  gramstops = ["apos", "as", "able", "about", "above", "according", "accordingly", "across", "actually", "after", "afterwards", "again", "against", "aint", "all", "allow", "allows", "almost", "alone", "along", "already", "also", "although", "always", "am", "among", "amongst", "an", "and", "another", "any", "anybody", "anyhow", "anyone", "anything", "anyway", "anyways", "anywhere", "apart", "appear", "appreciate", "appropriate", "are", "arent", "around", "as", "aside", "ask", "asking", "associated", "at", "available", "away", "awfully", "be", "became", "because", "become", "becomes", "becoming", "been", "before", "beforehand", "behind", "being", "believe", "below", "beside", "besides", "best", "better", "between", "beyond", "both", "brief", "but", "by", "cmon", "cs", "came", "can", "cant", "cannot", "cant", "cause", "causes", "certain", "certainly", "changes", "clearly", "co", "com", "come", "comes", "concerning", "consequently", "consider", "considering", "contain", "containing", "contains", "corresponding", "could", "couldnt", "course", "currently", "definitely", "described", "despite", "did", "didnt", "different", "do", "does", "doesnt", "doing", "dont", "done", "down", "downwards", "during", "each", "edu", "eg", "eight", "either", "else", "elsewhere", "enough", "entirely", "especially", "et", "etc", "even", "ever", "every", "everybody", "everyone", "everything", "everywhere", "ex", "exactly", "example", "except", "far", "few", "fifth", "first", "five", "followed", "following", "follows", "for", "former", "formerly", "forth", "four", "from", "further", "furthermore", "get", "gets", "getting", "given", "gives", "go", "goes", "going", "gone", "got", "gotten", "greetings", "had", "hadnt", "happens", "hardly", "has", "hasnt", "have", "havent", "having", "he", "hes", "hello", "help", "hence", "her", "here", "heres", "hereafter", "hereby", "herein", "hereupon", "hers", "herself", "hi", "him", "himself", "his", "hither", "hopefully", "how", "howbeit", "however", "i", "I", "id", "ill", "im", "ive", "ie", "if", "ignored", "immediate", "in", "inasmuch", "inc", "indeed", "indicate", "indicated", "indicates", "inner", "insofar", "instead", "into", "inward", "is", "isnt", "it", "itd", "itll", "its", "itself", "just", "keep", "keeps", "kept", "know", "knows", "known", "last", "lately", "later", "latter", "latterly", "least", "less", "lest", "let", "lets", "like", "liked", "likely", "little", "look", "looking", "looks", "ltd", "mainly", "many", "may", "maybe", "me", "mean", "meanwhile", "merely", "might", "more", "moreover", "most", "mostly", "much", "must", "my", "myself", "name", "namely", "nd", "near", "nearly", "necessary", "need", "needs", "neither", "never", "nevertheless", "new", "next", "nine", "no", "nobody", "non", "none", "noone", "nor", "normally", "not", "nothing", "now", "nowhere", "obviously", "of", "off", "often", "oh", "ok", "okay", "old", "on", "once", "one", "ones", "only", "onto", "or", "other", "others", "otherwise", "ought", "our", "ours", "ourselves", "out", "outside", "over", "overall", "own", "particular", "particularly", "per", "perhaps", "placed", "please", "plus", "possible", "presumably", "probably", "provides", "que", "quite", "qv", "rather", "rd", "re", "really", "reasonably", "regarding", "regardless", "regards", "relatively", "respectively", "right", "said", "same", "saw", "say", "saying", "says", "second", "secondly", "see", "seeing", "seem", "seemed", "seeming", "seems", "seen", "self", "selves", "sensible", "sent", "serious", "seriously", "seven", "several", "shall", "she", "should", "shouldnt", "since", "six", "so", "some", "somebody", "somehow", "someone", "something", "sometime", "sometimes", "somewhat", "somewhere", "soon", "sorry", "specified", "specify", "specifying", "still", "sub", "such", "sup", "sure", "ts", "take", "taken", "tell", "tends", "th", "than", "thank", "thanks", "thanx", "that", "thats", "thats", "the", "their", "theirs", "them", "themselves", "then", "thence", "there", "theres", "thereafter", "thereby", "therefore", "therein", "theres", "thereupon", "these", "they", "theyd", "theyll", "theyre", "theyve", "think", "third", "this", "thorough", "thoroughly", "those", "though", "three", "through", "throughout", "thru", "thus", "to", "together", "too", "took", "toward", "towards", "tried", "tries", "truly", "try", "trying", "twice", "two", "un", "under", "unfortunately", "unless", "unlikely", "until", "unto", "up", "upon", "us", "use", "used", "useful", "uses", "using", "usually", "value", "various", "very", "via", "viz", "vs", "want", "wants", "was", "wasnt", "way", "we", "wed", "well", "weve", "welcome", "well", "went", "were", "werent", "what", "whats", "whatever", "when", "whence", "whenever", "where", "wheres", "whereafter", "whereas", "whereby", "wherein", "whereupon", "wherever", "whether", "which", "while", "whither", "who", "whos", "whoever", "whole", "whom", "whose", "why", "will", "willing", "wish", "with", "within", "without", "wont", "wonder", "would", "would", "wouldnt", "yes", "yet", "you", "youd", "youll", "youre", "youve", "your", "yours", "yourself", "yourselves", "zero"];
  if (gramstops) {
    for (l = 0, len = gramstops.length; l < len; l++) {
      g = gramstops[l];
      if (indexOf.call(stops, g) < 0) {
        stops.push(g);
      }
    }
  }
  if (more) {
    if (typeof more === 'string') {
      more = more.split(',');
    }
    for (p = 0, len1 = more.length; p < len1; p++) {
      m = more[p];
      if (indexOf.call(stops, m) < 0) {
        stops.push(m);
      }
    }
  }
  return stops;
};

var indexOf = [].indexOf;

import {
  customAlphabet
} from 'nanoid';

P.uid = function(r) {
  var nanoid, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, rs;
  if (r == null) {
    r = this.fn === 'uid' ? (ref = (ref1 = (ref2 = (ref3 = this != null ? (ref4 = this.params) != null ? ref4.len : void 0 : void 0) != null ? ref3 : this != null ? (ref5 = this.params) != null ? ref5.length : void 0 : void 0) != null ? ref2 : this != null ? (ref6 = this.params) != null ? ref6.size : void 0 : void 0) != null ? ref1 : this != null ? (ref7 = this.params) != null ? ref7.uid : void 0 : void 0) != null ? ref : 21 : 21;
  }
  if (typeof r === 'string') {
    rs = parseInt(r);
    r = isNaN(rs) ? void 0 : rs;
  }
  // have to use only lowercase for IDs, because other IDs we receive from users such as DOIs
  // are often provided in upper OR lowercase forms, and they are case-insensitive, so all IDs
  // will be normalised to lowercase. This increases the chance of an ID collision, but still, 
  // without uppercases it's only a 1% chance if generating 1000 IDs per second for 131000 years.
  nanoid = customAlphabet((ref8 = this != null ? (ref9 = this.params) != null ? ref9.alphabet : void 0 : void 0) != null ? ref8 : '0123456789abcdefghijklmnopqrstuvwxyz', r);
  return nanoid();
};

P.uid._cache = false;

P.hash = async function(content) {
  var arr, b, buf, j, len, parts, ref, ref1, ref2, ref3;
  if (content == null) {
    content = (ref = (ref1 = (ref2 = (ref3 = this.params.hash) != null ? ref3 : this.params.content) != null ? ref2 : this.params.q) != null ? ref1 : this.params) != null ? ref : this.body;
  }
  try {
    if (this.params.url) {
      content = (await this.fetch(this.params.url));
    }
  } catch (error) {}
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  try {
    content = new TextEncoder().encode(content);
    buf = (await crypto.subtle.digest("SHA-256", content));
    arr = new Uint8Array(buf);
    parts = [];
    for (j = 0, len = arr.length; j < len; j++) {
      b = arr[j];
      parts.push(('00' + b.toString(16)).slice(-2));
    }
    return parts.join('');
  } catch (error) {
    // the above works on CF worker, but crypto.subtle needs to be replaced with standard crypto module on backend
    // crypto is imported by the server-side main api file
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex'); // md5 would be preferable but web crypto /subtle doesn't support md5
  }
};

P.hashcode = function(content) { // java hash code style
  var hash, i, ref, ref1, ref2, ref3;
  if (content == null) {
    content = (ref = (ref1 = (ref2 = (ref3 = this.params.shorthash) != null ? ref3 : this.params.content) != null ? ref2 : this.params.q) != null ? ref1 : this.params) != null ? ref : this.body;
  }
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  hash = 0;
  i = 0;
  while (i < content.length) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash &= hash;
    i++;
  }
  return hash;
};

P.hashhex = function(content) {
  var n;
  n = this.hashcode(content);
  if (n < 0) {
    n = 0xFFFFFFFF + n + 1;
  }
  return n.toString(16);
};

P.shorthash = function(content, alphabet) { // as learnt from something I once googled, but can't remember what
  var al, hash, ref, ref1, ref2, ref3, result, spare;
  if (content == null) {
    content = (ref = (ref1 = (ref2 = (ref3 = this.params.shorthash) != null ? ref3 : this.params.content) != null ? ref2 : this.params.q) != null ? ref1 : this.params) != null ? ref : this.body;
  }
  if (typeof content !== 'string') {
    content = JSON.stringify(content);
  }
  hash = this.hashcode(content);
  if (!alphabet) {
    alphabet = '0123456789abcdefghijklmnoqrstuvwxyz'; // keep one char from the usable range to replace negative signs on hashcodes
    spare = 'p';
  } else {
    spare = alphabet.substring(0, 1);
    alphabet = alphabet.replace(spare, '');
  }
  al = alphabet.length;
  result = hash < 0 ? spare : '';
  hash = Math.abs(hash);
  while (hash >= al) {
    result += alphabet[hash % al];
    hash = Math.floor(hash / al);
  }
  return result + (hash > 0 ? alphabet[hash] : '');
};

P.sleep = function(ms) { // await this when calling it to actually wait
  try {
    if (ms == null) {
      ms = this.params.ms;
    }
  } catch (error) {}
  return new Promise((resolve) => {
    return setTimeout(resolve, ms != null ? ms : 1000);
  });
};

P._timeout = function(ms, fn) { // where fn is a promise-able function that has been called
  // so call this like res = await @_timeout 5000, @fetch url
  return new Promise((resolve, reject) => {
    var timer;
    timer = setTimeout(() => {
      return reject(new Error('TIMEOUT')); // should this error or just return undefined?
    }, ms);
    return promise.then(value(() => {
      clearTimeout(timer);
      return resolve(value);
    })).catch(reason(() => {
      clearTimeout(timer);
      return reject(reason);
    }));
  });
};

P.form = function(params) {
  var j, len, p, po, ppt, ref;
  // return params object x-www-form-urlencoded
  if (params == null) {
    params = this.params;
  }
  po = '';
  for (p in params) {
    if (po !== '') {
      po += '&';
    }
    ref = (Array.isArray(params[p]) ? params[p] : [params[p]]);
    for (j = 0, len = ref.length; j < len; j++) {
      ppt = ref[j];
      if (ppt != null) {
        if (!po.endsWith('&')) {
          po += '&';
        }
        po += p + '=' + encodeURIComponent((typeof ppt === 'object' ? JSON.stringify(ppt) : ppt));
      }
    }
  }
  return po;
};

P.decode = async function(content) {
  var _decode, c, j, len, re, ref, ref1, ref2, ref3, text;
  if (content == null) {
    content = (ref = (ref1 = (ref2 = this.params.decode) != null ? ref2 : this.params.content) != null ? ref1 : this.params.text) != null ? ref : this.body;
  }
  _decode = function(content) {
    var translate, translator;
    // https://stackoverflow.com/questions/44195322/a-plain-javascript-way-to-decode-html-entities-works-on-both-browsers-and-node
    translator = /&(nbsp|amp|quot|lt|gt);/g;
    translate = {
      "nbsp": " ",
      "amp": "&",
      "quot": "\"",
      "lt": "<",
      "gt": ">"
    };
    return content.replace(translator, (function(match, entity) {
      return translate[entity];
    })).replace(/&#(\d+);/gi, (function(match, numStr) {
      var num;
      num = parseInt(numStr, 10);
      return String.fromCharCode(num);
    }));
  };
  text = (await _decode(content));
  text = text.replace(/\n/g, ' ');
  ref3 = [
    {
      bad: '‘',
      good: "'"
    },
    {
      bad: '’',
      good: "'"
    },
    {
      bad: '´',
      good: "'"
    },
    {
      bad: '“',
      good: '"'
    },
    {
      bad: '”',
      good: '"'
    },
    {
      bad: '–',
      good: '-'
    },
    {
      bad: '-',
      good: '-'
    }
  ];
  for (j = 0, len = ref3.length; j < len; j++) {
    c = ref3[j];
    re = new RegExp(c.bad, 'g');
    text = text.replace(re, c.good);
  }
  if (text.indexOf('%2') !== -1) {
    text = decodeURIComponent(text);
  }
  if (text.indexOf('%2') !== -1) { // some of the data we handle was double encoded, so like %2520, so need two decodes
    text = decodeURIComponent(text);
  }
  return text;
};

P.copy = function(obj) {
  try {
    if (obj == null) {
      obj = this.params;
    }
  } catch (error) {}
  return JSON.parse(JSON.stringify(obj));
};

P.keys = function(obj) {
  var k, keys;
  try {
    if (obj == null) {
      obj = this.params;
    }
  } catch (error) {}
  keys = [];
  for (k in obj != null ? obj : {}) {
    if ((obj[k] != null) && indexOf.call(keys, k) < 0) {
      keys.push(k);
    }
  }
  return keys;
};

P.dot = function(obj, key) {
  var j, k, len, ref, res, st;
  // TODO can add back in a way to pass in values or deletions if necessary, and traversing lists too
  if (typeof obj === 'string' && typeof key === 'object') {
    st = obj;
    obj = key;
    key = st;
  }
  if ((obj == null) && ((this != null ? (ref = this.params) != null ? ref.key : void 0 : void 0) != null)) {
    obj = this.copy(this.params);
    key = obj.key;
  }
  if (typeof key === 'string') {
    key = key.split('.');
  }
  try {
    res = obj;
    for (j = 0, len = key.length; j < len; j++) {
      k = key[j];
      res = res[k];
    }
    return res;
  } catch (error) {
    return void 0;
  }
};

P.flatten = async function(obj) {
  var _flatten, d, j, len, res, results;
  if (obj == null) {
    obj = this.params;
  }
  res = {};
  _flatten = async function(obj, key) {
    var k, n, pk, results1, v;
    results1 = [];
    for (k in obj) {
      pk = key ? key + '.' + k : k;
      v = obj[k];
      if (typeof v === 'string') {
        results1.push(res[pk] = v);
      } else if (Array.isArray(v)) {
        if (typeof v[0] === 'object') {
          results1.push((await (async function() {
            var results2;
            results2 = [];
            for (n in v) {
              results2.push((await _flatten(v[n], pk + '.' + n)));
            }
            return results2;
          })()));
        } else {
          results1.push(res[pk] = v.join(', '));
        }
      } else {
        results1.push((await _flatten(v, pk)));
      }
    }
    return results1;
  };
  if (Array.isArray(obj)) {
    results = [];
    for (j = 0, len = data.length; j < len; j++) {
      d = data[j];
      res = {};
      results.push((await _flatten(d)));
    }
    return results;
  } else {
    await _flatten(obj);
    return res;
  }
};

P.template = async function(content, vars) {
  var _rv, cp, cs, j, k, key, keyu, kg, kkg, l, len, len1, pcp, ref, ref1, ref2, ref3, ret, val, vs;
  if (content == null) {
    content = (ref = (ref1 = this.params.content) != null ? ref1 : this.params.template) != null ? ref : this.body;
  }
  if (vars == null) {
    vars = this.params;
  }
  if (this.params.url || content.startsWith('http')) {
    content = (await this.fetch((ref2 = this.params.url) != null ? ref2 : content));
  }
  if (content.indexOf(' ') === -1 && content.indexOf('.') !== -1 && content.length < 100) {
    try {
      cs = (await this._templates(content));
      content = cs.content;
    } catch (error) {}
  }
  ret = {};
  _rv = function(obj, pre = '') {
    var o, ov, results1, rg;
    results1 = [];
    for (o in obj) {
      ov = pre ? pre + '.' + o : o;
      if (typeof obj[o] === 'object' && !Array.isArray(obj[o])) {
        results1.push(_rv(obj[o], pre + (pre === '' ? '' : '.') + o));
      } else if (content.toLowerCase().indexOf('{{' + ov + '}}') !== -1) {
        rg = new RegExp('{{' + ov + '}}', 'gi');
        results1.push(content = content.replace(rg, (Array.isArray(obj[o]) ? obj[o].join(', ') : (typeof obj[o] === 'string' ? obj[o] : (obj[o] === true ? 'Yes' : (obj[o] === false ? 'No' : ''))))));
      } else {
        results1.push(void 0);
      }
    }
    return results1;
  };
  _rv(vars); // replace all vars that are in the content
  kg = new RegExp('{{.*?}}', 'gi');
  if (content.indexOf('{{') !== -1) { // retrieve any vars provided IN the content (e.g. a content template can specify a subject for an email to use)
    vs = ['subject', 'from', 'to', 'cc', 'bcc'];
    ref3 = content.toLowerCase().split('{{');
    // the could be vars in content that themselves contain vars, e.g {{subject I am the subject about {{id}} yes I am}}
    // and some of those vars may fail to get filled in. So define the list of possible vars names THEN go through the content with them
    for (j = 0, len = ref3.length; j < len; j++) {
      cp = ref3[j];
      pcp = cp.split('{{')[0].split('}}')[0].split(' ')[0];
      if (indexOf.call(vs, pcp) < 0) {
        vs.push(pcp);
      }
    }
    for (l = 0, len1 = vs.length; l < len1; l++) {
      k = vs[l];
      key = content.toLowerCase().indexOf('{{' + k) !== -1 ? k : void 0;
      if (key) {
        keyu = content.indexOf('{{' + key.toUpperCase()) !== -1 ? key.toUpperCase() : key;
        val = content.split('{{' + keyu)[1];
        if (val.split('}}')[0].indexOf('{{')) { // remove any vars present inside this one that were not able to have their values replaced
          val = val.replace(kg, '');
        }
        val = val.split('}}')[0].trim();
        if (val) {
          ret[key] = val;
        }
        kkg = new RegExp('{{' + keyu + '.*?}}', 'gi');
        content = content.replace(kkg, '');
      }
    }
  }
  if (content.indexOf('{{') !== -1) { // remove any outstanding vars in content that could not be replaced by provided vars
    content = content.replace(kg, '');
  }
  ret.content = content;
  // TODO consider if worth putting markdown formatting back in here, and how big a markdown parser is
  return ret; // an obj of the content plus any vars found within the template
};


//P._templates = _index: true # an index to store templates in - although generally should be handled at the individual function/service level
P.date = function(rt, timed) {
  var k, pts, ref, ret;
  if (rt == null) {
    rt = this.params.date;
  }
  if (timed == null) {
    timed = this.params.time;
  }
  if (typeof rt === 'number' || (typeof rt === 'string' && rt.indexOf(' ') === -1 && rt.length > 10 && rt.indexOf('T') === -1)) {
    try {
      ret = new Date(parseInt(rt));
      ret = ret.toISOString();
      if (timed) {
        return ret;
      } else {
        return ret.split('T')[0];
      }
    } catch (error) {}
  }
  try {
    if (typeof rt === 'number') {
      rt = rt.toString();
    }
    if (Array.isArray(rt) && rt.length === 1 && Array.isArray(rt[0])) {
      rt = rt[0];
    }
    if (typeof rt !== 'string') {
      try {
        for (k in rt) {
          if ((ref = typeof rt[k]) !== 'number' && ref !== 'string') {
            rt[k] = '01';
          }
        }
        rt = rt.join('-');
      } catch (error) {}
    }
    rt = decodeURIComponent(rt);
    if (rt.indexOf('T') !== -1) {
      rt = rt.split('T')[0];
    }
    rt = rt.replace(/\//g, '-').replace(/-(\d)-/g, "-0$1-").replace(/-(\d)$/, "-0$1");
    if (rt.indexOf('-') === -1) {
      rt += '-01';
    }
    pts = rt.split('-');
    if (pts.length !== 3) {
      rt += '-01';
      pts = rt.split('-');
    }
    if (pts.length !== 3) {
      rt = void 0;
    }
    if (pts[0].length < pts[2].length) {
      rt = pts.reverse().join('-');
    }
    return rt;
  } catch (error) {
    return void 0;
  }
};

P.datetime = function() {
  var ref;
  return this.date(this.params.datetime, (ref = this.params.time) != null ? ref : true);
};

P.epoch = function(epoch) {
  var end, ref, start;
  if (epoch == null) {
    epoch = this.params.epoch;
  }
  try {
    if (epoch.length > 10 && parseInt(epoch)) {
      return this.date(this.params.epoch, (ref = this.params.time) != null ? ref : true);
    }
  } catch (error) {}
  if (typeof epoch === 'number') {
    epoch = epoch.toString();
  }
  if (epoch.length === 4) {
    epoch += '-01';
  }
  if (epoch.split('-').length < 3) {
    epoch += '-01';
  }
  if (epoch.indexOf('T') === -1) {
    epoch += 'T';
  }
  if (epoch.indexOf(':') === -1) {
    epoch += '00:00';
  }
  if (epoch.split(':').length < 3) {
    epoch += ':00';
  }
  if (epoch.indexOf('.') === -1) {
    epoch += '.';
  }
  [start, end] = epoch.split('.');
  end = end.replace('Z', '').replace('z', '');
  while (end.length < 3) {
    end += '0';
  }
  if (end.indexOf('Z') === -1) {
    end += 'Z';
  }
  return new Date(start + '.' + end).valueOf();
};

`P.retry = (fn, params=[], opts={}) ->
  # params should be a list of params for the fn
  params = [params] if not Array.isArray params
  opts.retry ?= 3
  opts.pause ?= 500
  opts.increment ?= true
  # can provide a function in opts.check to check the result each time, and an opts.timeout to timeout each loop

  while opts.retry > 0
    res = undefined
    _wrap = () ->
      try
        res = await fn.apply this, params
    if typeof opts.timeout is 'number'
      await Promise.race [_wrap.call(this), P.sleep(opts.timeout)]
    else
      _wrap.call this
    if typeof opts.check is 'function'
      retry = await opts.check res, retry
      if retry is true
        return res
      else if retry is false
        retry -= 1
      else if typeof retry isnt 'number'
        retry = 0
    else if res? and res isnt false
      return res
    else
      retry -= 1

    if typeof opts.pause is 'number' and opts.pause isnt 0
      await P.sleep opts.pause
      if opts.increment is true
        opts.pause = opts.pause * 2
      else if typeof opts.increment is 'number'
        opts.pause += opts.increment
    
  return undefined


# see https://github.com/arlac77/fetch-rate-limit-util/blob/master/src/rate-limit-util.mjs
MIN_WAIT_MSECS = 1000 # wait at least this long
MAX_RETRIES = 5 # only retry max this many times

/**
 * @param {Integer} millisecondsToWait
 * @param {Integer} rateLimitRemaining parsed from "x-ratelimit-remaining" header
 * @param {Integer} nthTry how often have we retried the request already
 * @param {Object} response as returned from fetch
 * @return {Integer} milliseconds to wait for next try or < 0 to deliver current response
 */
defaultWaitDecide = (millisecondsToWait, rateLimitRemaining, nthTry, response) ->
  return if nthTry > MAX_RETRIES then -1 else millisecondsToWait + MIN_WAIT_MSECS

rateLimitHandler = (fetcher, waitDecide = defaultWaitDecide) ->
  i = 0
  while true
    response = await fetcher()

    switch (response.status) ->
      default:
        return response

      case 403:
      case 429:
        # this differs by API we're hitting, example was for github. 
        # It's the timestamp of when the rate limit window would reset, generalise this
        rateLimitReset = parseInt response.headers.get "x-ratelimit-reset"

        millisecondsToWait = if isNaN(rateLimitReset) then 0 else new Date(rateLimitReset * 1000).getTime() - Date.now()

        millisecondsToWait = waitDecide(millisecondsToWait, parseInt(response.headers.get("x-ratelimit-remaining")), i, response)
        if millisecondsToWait <= 0
          return response
        else
          await new Promise resolve => setTimeout resolve, millisecondsToWait
    i++`;

// https://developers.cloudflare.com/workers/runtime-apis/cache

// this is a cloudflare Cache implementation
// if an alternative has to be used, then write the alternative functions in a 
// different cache implementation, and add a method to swap P.cache to those functions
// yes, this could be done now, but if it never gets used then it's just premature optimisation
// if the cache isn't present this returns undefined and the main API code is written to continue 
// so it's an optional layer anyway
// top level API calls can cache, and any uses of fetch can cache directly too
// other methods can use this cache directly as well if they need to

// NOTE the cloudflare cache is only per region, not global. KV store is global (but only eventually consistent)

// https://community.cloudflare.com/t/how-long-does-the-basic-cloudflare-cdn-cache-things-for/85728
// https://support.cloudflare.com/hc/en-us/articles/218411427-What-does-edge-cache-expire-TTL-mean-#summary-of-page-rules-settings
// https://support.cloudflare.com/hc/en-us/articles/200168276

// https://developers.cloudflare.com/workers/examples/cache-api
P._cache = async function(request, response, age) {
  var ck, cu, h, hp, i, len, ref, rp, rs, url;
  if (typeof age !== 'number') {
    age = typeof this.S.cache === 'number' ? this.S.cache : this.S.dev ? 120 : 3600; // how long should default cache be?
  }
  // age is max age in seconds until removal from cache (note this is not strict, CF could remove for other reasons)
  // request and response needs to be an actual Request and Response objects
  // returns promise wrapping the Response object
  if (this.S.cache === false || this.S.bg === true) { // can change this if a backend cache mechanism is added later (prob not worthwhile)
    return void 0;
  } else {
    try {
      if (request == null) {
        request = this.request;
      }
      try {
        url = request.url.toString();
        ref = ['refresh'];
        // should caches be keyed to apikey? what about headers? Do they affect caching?
        for (i = 0, len = ref.length; i < len; i++) {
          h = ref[i];
          if (url.indexOf(h + '=') !== -1) {
            hp = new RegExp(h + '=.*?&');
            url = url.replace(hp, '');
          }
          if (url.indexOf('&' + h + '=') !== -1) {
            url = url.split('&' + h + '=')[0];
          }
        }
        cu = new URL(url);
      } catch (error) {}
    } catch (error) {}
    if (request != null) {
      try {
        if (cu == null) {
          cu = new URL(request.url);
        }
        // if request method is POST try changing to GET? and should any headers be removed?
        ck = new Request(cu.toString().replace('?refresh=true', '').replace('&refresh=true', ''), request);
        if ((response == null) || response === '') {
          rs = (await caches.default.match(ck));
          if (response === '') {
            this.waitUntil(caches.default.delete(ck));
          }
          return rs;
        } else {
          // what about things like apikey, refresh and other params, headers not wanted in cache?
          // need to build a request object here, and include a Last-Modified header? or cacheTtl would just let it time out?
          // and what about overriding the method? Always do that here or allow it to be done before here?
          // it has to be a GET for it to be accepted by the CF cache
          // could use just the URL string as key (and then, which query params to consider, if any?)
          // but if using just the URL string how would the refresh timeout be checked?
          response = response.clone(); // body of response can only be read once, so clone it
          rp = new Response(response.body, response);
          rp.headers.append("Cache-Control", "max-age=" + age);
          return this.waitUntil(caches.default.put(ck, rp));
        }
      } catch (error) {
        return void 0;
      }
    } else {
      return void 0;
    }
  }
};

  // TODO be able to receive bulk json lists or formatted bulk strings. Need to stick the useful default values into each
  // those would be createdAt, created_date (in default templates format for ES 7.1) and user ID of the action?

// TODO add alias handling, particularly so that complete new imports can be built in a separate index then just repoint the alias
  // alias can be set on create, and may be best just to use an alias every time
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-aliases.html
  // can also use aliases and alternate routes to handle auth to certain subsets of date
  // aliased mappings can also have a filter applied, so only the filter results get returned

// TODO if index SHOULD be available but fails, write to kv if that's available? But don't end up in a loop...
  // anything found by _schedule in kv that isn't set to _kv will get written to index once it becomes available
var base, base1, ref,
  indexOf = [].indexOf;

if (S.index == null) {
  S.index = {};
}

if ((base = S.index).name == null) {
  base.name = (ref = S.name) != null ? ref : 'Paradigm';
}

if (typeof S.index.name !== 'string') {
  S.index.name = '';
}

S.index.name = S.index.name.toLowerCase().replace(/\s/g, '');

if (typeof S.bg === 'string') {
  if ((base1 = S.index).url == null) {
    base1.url = S.bg + '/index';
  }
}

P.index = async function(route, data, qopts) {
  var c, chk, cidx, dni, ind, j, len, ref1, ref2, ref3, ref4, ref5, ret, rex, rpl, rqp;
  if (typeof route === 'object') {
    data = route;
    route = void 0;
  }
  if ((route == null) && (data == null) && ((this != null ? this.parts : void 0) != null) && this.parts.length && this.parts[0] === 'index') {
    if (this.parts.length > 1 && (this.parts[1].startsWith('.') || this.parts[1].startsWith('_') || ((ref1 = this.parts[1]) === 'svc' || ref1 === 'src'))) { //or P[@parts[1]]?) #  or @parts[1].startsWith('svc_') or @parts[1].startsWith('src_'))
      return {
        // don't allow direct calls to index if the rest of the params indicate an existing route
        // if not an existing route, a user with necessary auth could create/interact with a specified index
        // for indexes not on a specified route, their config such as auth etc will need to be passed at creation and stored somewhere
        status: 403 // for now this isn't really stopping things, for example svc_crossref_works
      };
    } else {
      if (typeof this.body === 'object') {
        data = this.copy(this.body);
      } else if (typeof this.body === 'string') {
        data = this.body;
      } else {
        data = this.copy(this.params);
      }
      delete data.route;
      delete data.index;
      delete data[this.fn.split('.').pop()];
      delete data._id; // no provision of scripts or index or _id by params - has to be by URL route, or provided directly
      if ((data.script != null) || JSON.stringify(data).toLowerCase().indexOf('<script') !== -1) {
        return void 0;
      }
    }
  }
  if (typeof data === 'object' && !Array.isArray(data)) {
    if (route == null) {
      route = (ref2 = data.route) != null ? ref2 : data.index;
    }
    delete data.route;
    delete data.index;
  }
  if (route == null) {
    if (((this != null ? this.parts : void 0) != null) && this.parts[0] === 'index') { // need custom auth for who can create/remove indexes and records directly?
      if (this.parts.length === 1) {
        return (await this.index._indices());
      } else if (this.parts.length === 2) { // called direct on an index
        route = this.parts[1];
      } else if (this.parts.length > 2) { // called on index/key route
        `lp = @parts[@parts.length-1]
lpp = @parts[@parts.length-2]
if (typeof P.index[lp] is 'function' and not lp.startsWith '_') or lpp is 'suggest'
  return @index[if lpp is 'suggest' then 'suggest' else lp] @route
else`;
        // most IDs will only be at position 3 but for example using a DOI as an ID would spread it across 3 and 4
        route = this.parts[1] + '/' + this.parts.slice(2).join('_'); // so combine them with an underscore - IDs can't have a slash in them
      }
    } else if ((this != null ? this.fn : void 0) != null) {
      // auth should not matter here because providing route or data means the function is being handled elsehwere, which should deal with auth
      route = this.fn.replace(/\./g, '_'); // if the wrapping function wants data other than that defined by the URL route it was called on, it MUST specify the route manually
      if (this.parts.join('.') !== this.fn) {
        // what if the @parts indicate this is a request for a specific record though, not just an index?
        route += '/' + this.parts.join('_').replace(route + '_', '');
      }
    }
  }
  if (typeof route !== 'string') {
    return void 0;
  }
  if (route.includes('?')) {
    [route, rqp] = route.split('?');
    rqp = '?' + rqp;
  } else {
    rqp = '';
  }
  if (route.endsWith('/')) {
    route = route.replace(/\/$/, '');
  }
  if (typeof data === 'object' && !Array.isArray(data) && data._id) {
    dni = data._id.replace(/\//g, '_');
    if (route.indexOf('/') === -1 && route.indexOf(dni) === -1) {
      route += '/' + data._id;
    }
    delete data._id; // ID can't go into the data for ES7.x
  }
  route = route.toLowerCase();
  rpl = route.split('/').length;
  cidx = (this != null ? this.index : void 0) != null ? this.index : P.index; // allow either P.index or a contextualised @index to be used
  if ((((this != null ? this.parts : void 0) != null) && this.parts[0] === 'index' && (this.request.method === 'DELETE' || this.params._delete)) || data === '') {
    // DELETE can happen on index or index/key, needs no additional route parts for index but index/key has to happen on _doc
    // TODO for @params._delete allow a passthrough of data in case it is a delete by query, once _submit is updated to handle that if still possible
    ret = (await cidx._submit(route.replace('/', '/_doc/') + rqp, ''));
    return void 0; //ret.acknowledged is true or ret.result is 'deleted'
  } else if (rpl === 1) {
    // CREATE can happen on index if index params are provided or empty object is provided
    // https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-create-index.html
    // simplest create would be {} or settings={number_of_shards:1} where 1 is default anyway
    if ((typeof data === 'string' && (data === '' || data.indexOf('\n') !== -1)) || Array.isArray(data)) {
      if (data === '') {
        return cidx._submit(route + rqp, data);
      } else {
        return cidx._bulk(route + rqp, data); // bulk create (TODO what about if wanting other bulk actions?)
      }
    } else if ((ref3 = typeof data) === 'object' || ref3 === 'string') {
      if (typeof data === 'string' || cidx._q(data)) {
        return cidx._submit(route + '/_search' + rqp, (await cidx.translate(data, qopts)));
      } else if (typeof data === 'object') {
        chk = (this != null ? this.copy : void 0) != null ? this.copy(data) : P.copy(data);
        ref4 = ['settings', 'aliases', 'mappings'];
        for (j = 0, len = ref4.length; j < len; j++) {
          c = ref4[j];
          delete chk[c];
        }
        if (JSON.stringify(chk) === '{}') {
          if (!(await cidx._submit(route + rqp))) {
            ind = !cidx._q(data) ? {
              settings: data.settings,
              aliases: data.aliases,
              mappings: data.mappings
            } : {};
            await cidx._submit(route + rqp, ind); // create the index
          }
          return cidx._submit(route + '/_search' + rqp); // just do a search
        } else {
          return cidx._submit(route + '/_doc' + rqp, data); // create a single record without ID (if it came with ID it would have been caught above and converted to route with multiple parts)
        }
      }
    } else {
      return cidx._submit(route + '/_search' + rqp);
    }
  } else if (rpl === 2 && ((data == null) || typeof data === 'object' && !Array.isArray(data))) {
    if (!route.startsWith('_') && !route.includes('/_')) {
      // CREATE or overwrite on index/key if data is provided - otherwise just GET the _doc
      // Should @params be able to default to write data on index/key?
      // TODO check how ES7.x accepts update with script in them
      route = route.replace('/', '/_doc/');
    }
    if ((data != null) && JSON.stringify(data) !== '{}') {
      if (typeof data === 'object' && (data.script != null)) {
        route += '_update';
        rqp += (rqp.length ? '&' : '?') + 'retry_on_conflict=2';
      }
      return cidx._submit(route + rqp, data); // or just get the record
    } else {
      ret = (await cidx._submit(route + rqp));
      if (typeof ret === 'object' && (ret._source || ret.fields)) {
        rex = (ref5 = ret._source) != null ? ref5 : ret.fields;
        if (rex._id == null) {
          rex._id = ret._id; // if _id can no longer be stored in the _source in ES7.x
        }
        ret = rex;
      }
      return ret;
    }
  }
  return void 0;
};

// calling this should be given a correct URL route for ES7.x, domain part of the URL is optional though.
// call the above to have the route constructed. method is optional and will be inferred if possible (may be removed)
P.index._submit = async function(route, data, method, deletes = true) { // deletes is true in dev, but remove or add auth control for live
  var opts, prefix, ref1, ref2, ref3, ref4, res, rqp, url;
  if (route.includes('?')) {
    [route, rqp] = route.split('?');
    rqp = '?' + rqp;
  } else {
    rqp = '';
  }
  route = route.toLowerCase(); // force lowercase on all IDs so that can deal with users giving incorrectly cased IDs for things like DOIs which are defined as case insensitive
  if (route.startsWith('/')) { // gets added back in when combined with the url
    route = route.replace('/', '');
  }
  if (route.endsWith('/')) {
    route = route.replace(/\/$/, '');
  }
  if (method == null) {
    method = data === '' ? 'DELETE' : (data != null) && (route.indexOf('/') === -1 || route.indexOf('/_create') !== -1 || (route.indexOf('/_doc') !== -1 && !route.endsWith('/_doc'))) ? 'PUT' : (data != null) || ((ref1 = route.split('/').pop().split('?')[0]) === '_refresh' || ref1 === '_aliases') ? 'POST' : 'GET';
  }
  if (method === 'DELETE' && (deletes !== true || route.indexOf('/_all') !== -1)) { // nobody can delete all via the API
    // TODO if data is a query that also has a _delete key in it, remove that key and do a delete by query? and should that be bulked? is dbq still allowed in ES7.x?
    return false;
  }
  if (!route.startsWith('http')) { // which it probably doesn't
    if (this.S.index.name && !route.startsWith(this.S.index.name) && !route.startsWith('_')) {
      prefix = (await this.dot(P, (route.split('/')[0]).replace(/_/g, '.') + '._prefix'));
      if (prefix !== false) {
        // TODO could allow prefix to be a list of names, and if index name is in the list, alias the index into those namespaces, to share indexes between specific instances rather than just one or global
        route = this.S.index.name + '_' + route;
      }
    }
    url = (this != null ? (ref2 = this.S) != null ? (ref3 = ref2.index) != null ? ref3.url : void 0 : void 0 : void 0) ? this.S.index.url : (ref4 = S.index) != null ? ref4.url : void 0;
    if (Array.isArray(url)) {
      url = url[Math.floor(Math.random() * url.length)];
    }
    if (typeof url !== 'string') {
      return void 0;
    }
    route = url + '/' + route;
  }
  if (!route.startsWith('http')) {
    console.log('NO INDEX URL AVAILABLE');
    return void 0;
  }
  route = route += rqp;
  opts = route.indexOf('/_bulk') !== -1 || typeof (data != null ? data.headers : void 0) === 'object' ? data : {
    body: data // fetch requires data to be body
  };
  if (route.indexOf('/_search') !== -1) {
    // avoid hits.total coming back as object in new ES, because it also becomes vague
    // see hits.total https://www.elastic.co/guide/en/elasticsearch/reference/current/breaking-changes-7.0.html
    route += (route.indexOf('?') === -1 ? '?' : '&') + 'rest_total_hits_as_int=true';
  }
  if (this.S.dev) {
    console.log('INDEX ' + route);
    console.log(method + ' ' + (data == null ? '' : JSON.stringify(Array.isArray(data) && data.length ? data[0] : data).substr(0, 1000)));
  }
  //opts.retry = 3
  opts.method = method;
  res = (await this.fetch(route, opts));
  if (this.S.dev) {
    try {
      console.log('INDEX QUERY FOUND', res.hits.total, res.hits.hits.length);
    } catch (error) {}
  }
  if ((res == null) || (typeof res === 'object' && typeof res.status === 'number' && res.status >= 400 && res.status <= 600)) {
    // fetch returns undefined for 404, otherwise any other error from 400 is returned like status: 400
    // write a log / send an alert?
    //em = level: 'debug', msg: 'ES error, but may be OK, 404 for empty lookup, for example', method: method, url: url, route: route, opts: opts, error: err.toString()
    //if this?.log? then @log(em) else P.log em
    // do anything for 409 (version mismatch?)
    return void 0;
  } else {
    try {
      if (this.S.dev && ((data != null ? data.query : void 0) != null)) {
        res.q = data;
      }
    } catch (error) {}
    return res;
  }
};

P.index._mapping = async function(route) {
  if (typeof route !== 'string') {
    return false;
  }
  route = route.replace(/^\//, ''); // remove any leading /
  if (route.indexOf('/') === -1) {
    route = route + '/';
  }
  if (route.indexOf('_mapping') === -1) {
    route = route.replace('/', '/_mapping');
  }
  return (await this.index._submit(route));
};

P.index.keys = async function(route) {
  var _keys, keys, ref1;
  try {
    if (route == null) {
      route = (ref1 = this.params.index) != null ? ref1 : this.params.keys;
    }
    if (route == null) {
      route = this.fn.replace(/\./g, '/');
    }
    route = route.replace('index/', '').replace('/keys', '');
  } catch (error) {}
  keys = [];
  _keys = async(mapping, depth = '') => {
    var k, ref2, ref3, ref4, ref5, ref6, ref7, ref8, results;
    if (mapping == null) {
      mapping = typeof route === 'object' ? route : (await this.index._mapping(route));
    }
    mapping.properties = (ref2 = (ref3 = (ref4 = mapping[route]) != null ? (ref5 = ref4.mappings) != null ? ref5.properties : void 0 : void 0) != null ? ref3 : (ref6 = mapping[this.S.index.name + '_' + route]) != null ? (ref7 = ref6.mappings) != null ? ref7.properties : void 0 : void 0) != null ? ref2 : mapping.properties;
    if (mapping.properties != null) {
      if (depth.length) {
        depth += '.';
      }
      results = [];
      for (k in mapping.properties) {
        if (ref8 = depth + k, indexOf.call(keys, ref8) < 0) {
          keys.push(depth + k);
        }
        if (mapping.properties[k].properties != null) {
          results.push((await _keys(mapping.properties[k], depth + k)));
        } else {
          results.push(void 0);
        }
      }
      return results;
    }
  };
  await _keys();
  return keys;
};

P.index.terms = async function(route, key, qry, size = 1000, counts = true, order = "count") {
  var j, len, p, query, ref1, ref2, ref3, ref4, ref5, res, ret;
  try {
    if (route == null) {
      route = (ref1 = this.params.index) != null ? ref1 : this.params.terms;
    }
    if (route == null) {
      route = this.fn.replace(/\./g, '/');
    }
    route = route.replace('index/', '').replace('/terms', '');
    if ((key == null) && route.indexOf('/') !== -1) {
      [route, key] = route.split('/');
    }
    cp(this.copy(this.params));
    delete cp.index;
    if (cp.size != null) {
      size = cp.size;
      delete cp.size;
    }
    if (cp.counts != null) {
      counts = cp.counts;
      delete cp.counts;
    }
    if (cp.order != null) {
      order = cp.order;
      delete cp.order;
    }
    if ((qry == null) && this.index._q(cp)) {
      qry = (await this.index.translate(cp));
    }
  } catch (error) {}
  if (!key) {
    return [];
  }
  query = typeof qry === 'object' ? qry : {
    size: 0,
    query: {
      bool: {
        must: [],
        filter: [
          {
            exists: {
              field: key
            }
          }
        ]
      }
    }
  };
  if (typeof qry === 'string') {
    query.query.bool.must.push({
      query_string: {
        query: qry
      }
    });
  }
  if (query.aggregations == null) {
    query.aggregations = {};
  }
  // order: (default) count is highest count first, reverse_count is lowest first. term is ordered alphabetical by term, reverse_term is reverse alpha
  if (order === 'count') { // convert for ES7.x
    order = {
      _count: 'desc' // default
    };
  } else if (order === 'reverse_count') {
    order = {
      _count: 'asc'
    };
  } else if (order === 'term') {
    order = {
      _key: 'asc'
    };
  } else if (order === 'reverse_term') {
    order = {
      _key: 'desc'
    };
  }
  query.aggregations[key] = {
    terms: {
      field: key + (key.indexOf('.keyword') === -1 ? '.keyword' : ''),
      size: size,
      order: order
    }
  };
  ret = (await this.index._submit('/' + route + '/_search', query, 'POST'));
  res = [];
  ref5 = (ref2 = ret != null ? (ref3 = ret.aggregations) != null ? (ref4 = ref3[key]) != null ? ref4.buckets : void 0 : void 0 : void 0) != null ? ref2 : [];
  for (j = 0, len = ref5.length; j < len; j++) {
    p = ref5[j];
    res.push(counts ? {
      term: p.key,
      count: p.doc_count
    } : p.key);
  }
  return res;
};

P.index.suggest = async function(route, key, qry, size = 100, counts = false, order = "term") {
  var j, k, l, len, len1, q, ref1, ref2, ref3, res;
  if (route == null) {
    route = (ref1 = this.params.index) != null ? ref1 : this.params.suggest;
  }
  if (route == null) {
    route = this.fn.replace(/\./g, '/');
  }
  route = route.replace('index/', ''); //.replace '/suggest', ''
  if (!route.endsWith('suggest')) {
    [route, q] = route.split('/suggest/');
    if (key == null) {
      key = route.split('/').pop();
    }
    route = route.replace('/' + key, '');
    if (q && (qry == null)) {
      qry = key + ':' + q + '*';
    }
  }
  res = [];
  ref2 = (await this.index.terms(route, key, qry, size, counts, order));
  for (j = 0, len = ref2.length; j < len; j++) {
    k = ref2[j];
    if (!q || k.toLowerCase().indexOf(q.toLowerCase()) === 0) { // or match at start?
      res.push(k);
    }
  }
  if (res.length === 0 && q && typeof qry === 'string') {
    qry = qry.replace(':', ':*');
    ref3 = (await this.index.terms(route, key, qry, size, counts, order));
    for (l = 0, len1 = ref3.length; l < len1; l++) {
      k = ref3[l];
      if (!q || k.toLowerCase().indexOf(q.toLowerCase()) !== -1) { // or match at start?
        res.push(k);
      }
    }
  }
  return res;
};

P.index.count = async function(route, key, qry) {
  var cq, j, k, len, ref1, ref2, ref3, ref4, ref5, ref6, ref7, ret;
  try {
    if (route == null) {
      route = (ref1 = (ref2 = this.params.index) != null ? ref2 : this.params.count) != null ? ref1 : this.fn.replace(/\./g, '_');
    }
  } catch (error) {}
  if (route.indexOf('/') !== -1) {
    [route, key] = route.split('/');
  }
  try {
    if (key == null) {
      key = (ref3 = this.params.count) != null ? ref3 : this.params.key;
    }
  } catch (error) {}
  try {
    cq = this.copy(this.params);
    ref4 = ['index', 'route', 'count', 'key'];
    for (j = 0, len = ref4.length; j < len; j++) {
      k = ref4[j];
      delete cq[k];
    }
    if ((qry == null) && this.index._q(cq)) {
      qry = (await this.index.translate(cq));
    }
  } catch (error) {}
  if (qry == null) {
    qry = {
      query: {
        bool: {
          must: [],
          filter: []
        }
      }
    };
  }
  if (key) {
    if (key.indexOf('.keyword') === -1) {
      key += '.keyword';
    }
    qry.size = 0;
    qry.aggs = {
      keyed: {
        cardinality: {
          field: key,
          precision_threshold: 40000 // this is high precision and will be very memory-expensive in high cardinality keys, with lots of different values going in to memory
        }
      }
    };
    ret = (await this.index._submit('/' + route + '/_search', qry, 'POST'));
    return ret != null ? (ref5 = ret.aggregations) != null ? (ref6 = ref5.keyed) != null ? ref6.value : void 0 : void 0 : void 0;
  } else {
    ret = (await this.index._submit('/' + route + '/_search', qry, 'POST'));
    return ret != null ? (ref7 = ret.hits) != null ? ref7.total : void 0 : void 0;
  }
};

P.index.min = async function(route, key, qry) {
  var query, ref1, ret;
  try {
    if (route == null) {
      route = (ref1 = this.params.index) != null ? ref1 : this.params.min;
    }
    if (route == null) {
      route = this.fn.replace(/\./g, '/');
    }
    route = route.replace('index/', '').replace('/min', '');
    if ((key == null) && route.indexOf('/') !== -1) {
      [route, key] = route.split('/');
    }
    delete this.params.index;
    if (this.index._q(this.params)) {
      if (qry == null) {
        qry = (await this.index.translate(this.params));
      }
    }
  } catch (error) {}
  query = typeof key === 'object' ? key : qry != null ? qry : {
    query: {
      bool: {
        must: [],
        filter: [
          {
            exists: {
              field: key
            }
          }
        ]
      }
    }
  };
  query.size = 0;
  query.aggs = {
    min: {
      min: {
        field: key
      }
    }
  };
  ret = (await this.index._submit('/' + route + '/_search', query, 'POST'));
  return ret.aggregations.min.value;
};

P.index.max = async function(route, key, qry) {
  var query, ref1, ret;
  try {
    if (route == null) {
      route = (ref1 = this.params.index) != null ? ref1 : this.params.max;
    }
    if (route == null) {
      route = this.fn.replace(/\./g, '/');
    }
    route = route.replace('index/', '').replace('/max', '');
    if ((key == null) && route.indexOf('/') !== -1) {
      [route, key] = route.split('/');
    }
    delete this.params.index;
    if (this.index._q(this.params)) {
      if (qry == null) {
        qry = (await this.index.translate(this.params));
      }
    }
  } catch (error) {}
  query = typeof key === 'object' ? key : qry != null ? qry : {
    query: {
      bool: {
        must: [],
        filter: [
          {
            exists: {
              field: key
            }
          }
        ]
      }
    }
  };
  query.size = 0;
  query.aggs = {
    max: {
      max: {
        field: key
      }
    }
  };
  ret = (await this.index._submit('/' + route + '/_search', query, 'POST'));
  return ret.aggregations.max.value;
};

P.index.range = async function(route, key, qry) {
  var query, ref1, ret;
  try {
    if (route == null) {
      route = (ref1 = this.params.index) != null ? ref1 : this.params.range;
    }
    if (route == null) {
      route = this.fn.replace(/\./g, '/');
    }
    route = route.replace('index/', '').replace('/range', '');
    if ((key == null) && route.indexOf('/') !== -1) {
      [route, key] = route.split('/');
    }
    delete this.params.index;
    if (this.index._q(this.params)) {
      if (qry == null) {
        qry = (await this.index.translate(this.params));
      }
    }
  } catch (error) {}
  query = typeof key === 'object' ? key : qry != null ? qry : {
    query: {
      bool: {
        must: [],
        filter: [
          {
            exists: {
              field: key
            }
          }
        ]
      }
    }
  };
  query.size = 0;
  query.aggs = {
    min: {
      min: {
        field: key
      }
    },
    max: {
      max: {
        field: key
      }
    }
  };
  ret = (await this.index._submit('/' + route + '/_search', query, 'POST'));
  return {
    min: ret.aggregations.min.value,
    max: ret.aggregations.max.value
  };
};

// can still manually make scan/scroll calls if desired, see:
//  scan, scroll='10m'
//  if scan is true
//    route += (if route.indexOf('?') is -1 then '?' else '&')
//    if not data? or (typeof data is 'object' and not data.sort?) or (typeof data is 'string' and data.indexOf('sort=') is -1)
//      route += 'search_type=scan&'
//    route += 'scroll=' + scroll
//  else if scan?
//    route = '/_search/scroll?scroll_id=' + scan + (if action isnt 'DELETE' then '&scroll=' + scroll else '')
P.index._each = async function(route, q, opts, fn) {
  var action, chk, fr, h, j, len, max_size, processed, qy, ref1, ref2, ref3, ref4, ref5, ref6, ref7, res, rf, scroll, sz, updates;
  // use scan/scroll for each, because _pit is only available in "default" ES, which ES means is NOT the open one, so our OSS distro does not include it!
  // https://www.elastic.co/guide/en/elasticsearch/reference/7.10/paginate-search-results.html#search-after
  // each executes the function for each record. If the function makes changes to a record and saves those changes, 
  // this can cause many writes to the collection. So, instead, that sort of function could return something
  // and if the action has also been specified then all the returned values will be used to do a bulk write to the collection index.
  // suitable returns would be entire records for insert, record update objects for update, or record IDs for remove
  // this does not allow different actions for different records that are operated on - so has to be bulks of the same action
  if (fn === void 0 && opts === void 0 && typeof q === 'function') {
    fn = q;
    q = '*';
  }
  if (fn === void 0 && typeof opts === 'function') {
    fn = opts;
    opts = void 0;
  }
  if (opts == null) {
    opts = {};
  }
  if (opts.scroll != null) {
    scroll = opts.scroll;
    delete opts.scroll;
  } else {
    scroll = '10m';
  }
  if (opts.action) {
    action = opts.action;
    delete opts.action;
  } else {
    action = false;
  }
  qy = (await this.index.translate(q, opts));
  qy.from = 0; // from has to be 0 for search_after
  if (qy.size == null) {
    qy.size = 1000; // 10000 is max and would be fine for small records...
  }
  sz = (ref1 = qy.size) != null ? ref1 : 800;
  qy.size = 1;
  chk = (await this.index(route, qy));
  if (((chk != null ? (ref2 = chk.hits) != null ? ref2.total : void 0 : void 0) != null) && chk.hits.total !== 0) {
    // make sure that query result size does not take up more than about 1gb
    // NOTE also that in a scroll-scan size is per shard, not per result set
    max_size = Math.floor(1000000000 / (Buffer.byteLength(JSON.stringify(chk.hits.hits[0])) * chk._shards.total));
    if (max_size < sz) {
      sz = max_size;
    }
  }
  qy.size = sz;
  res = (await this.index(route + '?scroll=' + scroll, qy));
  if (((res != null ? (ref3 = res.hits) != null ? ref3.total : void 0 : void 0) != null) && res.hits.total === res.hits.hits.length) {
    delete res._scroll_id;
  }
  processed = 0;
  updates = [];
  while (((res != null ? (ref7 = res.hits) != null ? ref7.hits : void 0 : void 0) != null) && res.hits.hits.length) {
    ref4 = res.hits.hits;
    for (j = 0, len = ref4.length; j < len; j++) {
      h = ref4[j];
      fn = fn.bind(this);
      rf = (ref5 = (ref6 = h._source) != null ? ref6 : h.fields) != null ? ref5 : {};
      if (!h.fields) {
        if (rf._id == null) {
          rf._id = h._id;
        }
      }
      fr = fn(rf);
      processed += 1;
      if ((fr != null) && (typeof fr === 'object' || typeof fr === 'string')) {
        updates.push(fr);
      }
    }
    if (res._scroll_id != null) {
      res = (await this.index('/_search/scroll?scroll_id=' + res._scroll_id + '&scroll=' + scroll));
    } else {
      res.hits.hits = [];
    }
  }
  if (this.S.dev && this.S.bg === true) {
    console.log('_each processed ' + processed);
  }
  if (action && updates.length) { // TODO should prob do this during the while loop above, once updates reaches some number
    return this.index._bulk(route, updates, action);
  }
};

P.index._bulk = async function(route, data, action = 'index', bulk = 50000) {
  var cidx, counter, errs, i, j, k, len, meta, pkg, prefix, r, ref1, ref2, ref3, rid, row, rows, rs;
  if (action === true) {
    // https://www.elastic.co/guide/en/elasticsearch/reference/1.4/docs-bulk.html
    // https://www.elastic.co/guide/en/elasticsearch/reference/1.4/docs-update.html
    action = 'index';
  }
  prefix = (await this.dot(P, (route.split('/')[0]).replace(/_/g, '.') + '._prefix'));
  if (prefix !== false) { // need to do this here as well as in _submit so it can be set below in each object of the bulk
    route = this.S.index.name + '_' + route;
  }
  cidx = (this != null ? this.index : void 0) != null ? this.index : P.index;
  if (typeof data === 'string' && data.indexOf('\n') !== -1) {
    // TODO should this check through the string and make sure it only indexes to the specified route?
    await cidx._submit('/_bulk', {
      body: data,
      headers: {
        'Content-Type': 'application/x-ndjson' // new ES 7.x requires this rather than text/plain
      }
    });
    return true;
  } else {
    rows = typeof data === 'object' && !Array.isArray(data) && ((data != null ? (ref1 = data.hits) != null ? ref1.hits : void 0 : void 0) != null) ? data.hits.hits : data;
    if (!Array.isArray(rows)) {
      rows = [rows];
    }
    counter = 0;
    pkg = '';
    for (r in rows) {
      counter += 1;
      row = rows[r];
      rid = void 0;
      if (typeof row === 'object') {
        if (row._source != null) {
          row = row._source;
        }
        if (row._id) {
          rid = row._id;
          delete row._id; // newer ES 7.x won't accept the _id in the object itself
        } else {
          rid = (this != null ? this.uid : void 0) != null ? this.uid() : P.uid();
        }
      }
      meta = {};
      meta[action] = {
        "_index": route
      };
      meta[action]._id = action === 'delete' && typeof row === 'string' ? row : rid; // what if action is delete but can't set an ID?
      pkg += JSON.stringify(meta) + '\n';
      if (action === 'create' || action === 'index') {
        pkg += JSON.stringify(row) + '\n';
      } else if (action === 'update') {
        pkg += JSON.stringify({
          doc: row
        }) + '\n'; // is it worth expecting other kinds of update in bulk import?
      }
      // don't need a second row for deletes
      if (counter === bulk || parseInt(r) === (rows.length - 1) || pkg.length > 70000000) {
        rs = (await cidx._submit('/_bulk', {
          body: pkg,
          headers: {
            'Content-Type': 'application/x-ndjson'
          }
        }));
        if ((this != null ? (ref2 = this.S) != null ? ref2.dev : void 0 : void 0) && (rs != null ? rs.errors : void 0)) {
          errs = [];
          ref3 = rs.items;
          for (j = 0, len = ref3.length; j < len; j++) {
            i = ref3[j];
            for (k in i) {
              if (i[k].status >= 300) {
                errs.push(i);
              }
            }
          }
          console.log('Bulk load errors: ' + errs.length + ', like: ' + JSON.stringify(errs[0]));
        }
        pkg = '';
        counter = 0;
      }
    }
    return rows.length;
  }
};

P.index._indices = async function(verbose = false) {
  var base2, i, j, len, res, s, sh, shards;
  res = verbose ? {} : [];
  s = (await this.index._submit('_stats'));
  shards = !verbose ? [] : (await this.index._submit('_cat/shards?format=json'));
  for (i in s.indices) {
    if (indexOf.call([], i) < 0 && !i.startsWith('.') && !i.startsWith('security-')) {
      if (verbose) {
        // is primaries or total better for numbers here?
        res[i] = {
          docs: s.indices[i].primaries.docs.count,
          size: Math.ceil(s.indices[i].primaries.store.size_in_bytes / 1024 / 1024) + 'mb'
        };
        for (j = 0, len = shards.length; j < len; j++) {
          sh = shards[j];
          if (sh.index === i && sh.prirep === 'p') {
            if ((base2 = res[i]).shards == null) {
              base2.shards = 0;
            }
            res[i].shards += 1;
          }
        }
      } else {
        res.push(i);
      }
    }
  }
  return res;
};

P.index.status = async function() {
  var j, k, len, ref1, ref2, res;
  res = {
    status: 'green'
  };
  res.indices = (await this.index._indices(true));
  try {
    if ((ref1 = res.cluster.status) !== 'green' && ref1 !== 'yellow') { // accept yellow for single node cluster (or configure ES itself to accept that as green)
      res.status = 'red';
    }
    ref2 = ['cluster_name', 'number_of_nodes', 'number_of_data_nodes', 'unassigned_shards'];
    for (j = 0, len = ref2.length; j < len; j++) {
      k = ref2[j];
      delete res.cluster[k];
    }
  } catch (error) {}
  return res;
};

P.index.status._cache = false;

// helper to identify strings or objects that likely should be interpreted as queries
P.index._q = function(q, rt) { // could this be a query as opposed to an _id or index/_id string
  var c, j, k, l, len, len1, ref1, ref2;
  if (typeof q === 'object' && !Array.isArray(q)) {
    ref1 = ['settings', 'aliases', 'mappings', 'index'];
    for (j = 0, len = ref1.length; j < len; j++) {
      k = ref1[j];
      if (q[k]) {
        return false;
      }
    }
    if ((q.q != null) || (q.query != null)) {
      return true; // q or query COULD be valid values of an object, in which case don't pass such objects to ambiguous locations such as the first param of an index function
    }
  } else if (typeof q === 'string' && q.length && q.indexOf('\n') === -1) { // newlines indicates a bulk load string
    if (typeof rt === 'string' && q.toLowerCase().startsWith(rt.toLowerCase())) {
      return false; // handy check for a string that is probably an index route, just to save manually checking elsewhere
    } else if (q.startsWith('?') || q.startsWith('q=')) { // like an incoming URL query params string
      return true;
    } else if (q.length < 8 || (q.indexOf('/') !== -1 ? q.split('/').pop() : q).length > 34) { // no _id would be shorter than 8 or longer than 34
      return true;
    } else {
      ref2 = [' ', ':', '*', '~', '(', ')', '?'];
      // none of these are present in an ID
      for (l = 0, len1 = ref2.length; l < len1; l++) {
        c = ref2[l];
        if (q.indexOf(c) !== -1) {
          return true;
        }
      }
    }
  }
  return false;
};

/* query formats that can be accepted:
    'A simple string to match on'
    'statement:"A more complex" AND difficult string' - which will be used as is to ES as a query string
    '?q=query params directly as string'
    {"q":"object of query params"} - must contain at least q or source as keys to be identified as such
    {"must": []} - a list of must queries, in full ES syntax, which will be dropped into the query filter (works for "should" as well)
    {"object":"of key/value pairs, all of which must match"} - so this is an AND terms match/ If keys do not point to strings, they will be assumed to be named ES queries that can drop into the bool
    ["list","of strings to OR match on"] - this is an OR query strings match UNLESS strings contain : then mapped to terms matches
    [{"list":"of objects to OR match"}] - so a set of OR terms matches. If objects are not key: string they are assumed to be full ES queries that can drop into the bool

    Keys can use dot notation

    Options that can be included:
    If options is true, the query will be adjusted to sort by createdAt descending, so returning the newest first (it sets newest:true, see below)
    If options is string 'random' it will convert the query to be a random order
    If options is a number it will be assumed to be the size parameter
    Otherwise options should be an object (and the above can be provided as keys, "newest", "random")
    If newest is true the query will have a sort desc on createdAt. If false, sort will be asc
    If "random" key is provided, "seed" can be provided too if desired, for seeded random queries
    If "restrict" is provided, should point to list of ES queries to add to the and part of the query filter
    Any other keys in the options object should be directly attributable to an ES query object

    For ES 7.x there is no filtered query any more, filter is a value of bool.must
    Filter essentially acts like a must but without scoring. Whereas normal must does score.
    must_not also does not affect score. Not sure about should

    Default empty query looks like:
    {query: {bool: {must: [], filter: []}}, size: 10}
*/
P.index.translate = function(q, opts = {}) {
  var _structure, a, af, b, base2, base3, base4, bm, bt, dk, exc, excludes, f, fq, i, i1, inc, includes, j, j1, k, k1, l, l1, len, len1, len10, len11, len2, len3, len4, len5, len6, len7, len8, len9, m, n, nos, nr, o, ok, os, pfx, ps, qobj, qpts, qry, ref1, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, rs, sr, t, tgt, tm, tobj, u, v, w, x, y, z;
  if (q == null) {
    q = this != null ? this.params : void 0;
  }
  try {
    if (typeof q === 'object') { // copy objects so don't interfere with what was passed in
      q = this.copy(q);
    }
  } catch (error) {}
  try {
    if (typeof opts === 'object') {
      opts = this.copy(opts);
    }
  } catch (error) {}
  if (opts === 'random') {
    opts = {
      random: true
    };
  }
  if (typeof opts === 'number') {
    opts = {
      size: opts
    };
  }
  if (opts === true) {
    opts = {
      newest: true
    };
  }
  if (opts === false) {
    opts = {
      newest: false
    };
  }
  qry = (ref1 = opts != null ? opts.query : void 0) != null ? ref1 : {};
  if (qry.query == null) {
    qry.query = {};
  }
  _structure = function(sq) {
    var base2, base3, ms;
    if (sq.query == null) {
      sq.query = {
        bool: {
          must: [],
          filter: []
        }
      };
    }
    if (sq.query.bool == null) {
      ms = [];
      if (JSON.stringify(sq.query) !== '{}') {
        ms.push(sq.query);
      }
      sq.query = {
        bool: {
          must: ms,
          filter: []
        }
      };
    }
    if ((base2 = sq.query.bool).must == null) {
      base2.must = [];
    }
    if ((base3 = sq.query.bool).filter == null) {
      base3.filter = [];
    }
    return sq;
  };
  qry = _structure(qry);
  if (typeof q === 'object') {
    ref2 = ['apikey', '_', 'callback', 'refresh', 'key', 'counts', 'index'];
    for (j = 0, len = ref2.length; j < len; j++) {
      dk = ref2[j];
      delete q[dk];
    }
    ref3 = ['random', 'seed'];
    // is this necessary or is the general push of things other than q to opts good enough?
    for (l = 0, len1 = ref3.length; l < len1; l++) {
      ok = ref3[l];
      opts[ok] = q[ok];
      delete q[ok];
    }
    // some URL params that may be commonly used in this API along with valid ES URL query params will be removed here by default too
    // this makes it easy to handle them in routes whilst also just passing the whole queryParams object into this translation method and still get back a valid ES query
    if (JSON.stringify(q).indexOf('[') === 0) {
      if ((base2 = qry.query.bool).should == null) {
        base2.should = [];
      }
      for (n = 0, len2 = q.length; n < len2; n++) {
        m = q[n];
        if (typeof m === 'object' && (m != null)) {
          for (k in m) {
            if (typeof m[k] === 'string') {
              tobj = {
                term: {}
              };
              tobj.term[k] = m[k];
              qry.query.bool.should.push(tobj);
            } else if ((ref4 = typeof m[k]) === 'number' || ref4 === 'boolean') {
              qry.query.bool.should.push({
                query_string: {
                  query: k + ':' + m[k]
                }
              });
            } else if (m[k] != null) {
              qry.query.bool.should.push(m[k]);
            }
          }
        } else if (typeof m === 'string') {
          qry.query.bool.should.push({
            query_string: {
              query: m
            }
          });
        }
      }
    } else if (q.query != null) {
      qry = q; // assume already a query
    } else if (q.source != null) {
      if (typeof q.source === 'string') {
        qry = JSON.parse(q.source);
      }
      if (typeof q.source === 'object') {
        qry = q.source;
      }
      if (opts == null) {
        opts = {};
      }
      for (o in q) {
        if (o !== 'source') {
          if (opts[o] == null) {
            opts[o] = q[o];
          }
        }
      }
    } else if (q.q != null) {
      if ((q.prefix != null) && q.q.indexOf(':') !== -1) {
        delete q.prefix;
        pfx = {};
        qpts = q.q.split(':');
        pfx[qpts[0]] = qpts[1];
        qry.query.bool.must.push({
          prefix: pfx
        });
      } else {
        qry.query.bool.must.push({
          query_string: {
            query: decodeURIComponent(q.q)
          }
        });
      }
      if (opts == null) {
        opts = {};
      }
      for (o in q) {
        if (o !== 'q') {
          if (opts[o] == null) {
            opts[o] = q[o];
          }
        }
      }
    } else {
      ref5 = ['must', 'must_not', 'filter', 'should'];
      for (t = 0, len3 = ref5.length; t < len3; t++) {
        bt = ref5[t];
        if (q[bt] != null) {
          qry.query.bool[bt] = q[bt];
        }
      }
// an object where every key is assumed to be an AND term search if string, or a named search object to go in to ES
      for (y in q) {
        if ((y === 'fields') || (y === 'sort' && typeof q[y] === 'string' && q[y].indexOf(':') !== -1) || ((y === 'from' || y === 'size') && (typeof q[y] === 'number' || !isNaN(parseInt(q[y]))))) {
          if (opts == null) {
            opts = {};
          }
          opts[y] = q[y];
        } else if (y !== 'must' && y !== 'must_not' && y !== 'filter' && y !== 'should') {
          if (typeof q[y] === 'string') {
            tobj = {
              term: {}
            };
            tobj.term[y] = q[y];
            qry.query.bool.filter.push(tobj);
          } else if ((ref6 = typeof q[y]) === 'number' || ref6 === 'boolean') {
            qry.query.bool.filter.push({
              query_string: {
                query: y + ':' + q[y]
              }
            });
          } else if (typeof q[y] === 'object') {
            qobj = {};
            qobj[y] = q[y];
            qry.query.bool.filter.push(qobj);
          } else if (q[y] != null) {
            qry.query.bool.filter.push(q[y]);
          }
        }
      }
    }
  } else if (typeof q === 'string') {
    if (q.indexOf('?') === 0) {
      qry = q; // assume URL query params and just use them as such?
    } else if (q != null) {
      if (q === '') {
        q = '*';
      }
      qry.query.bool.must.push({
        query_string: {
          query: q
        }
      });
    }
  }
  qry = _structure(qry); // do this again to make sure valid structure is present after above changes, and before going through opts which require expected structure
  if (opts != null) {
    if (opts.newest === true) {
      delete opts.newest;
      opts.sort = {
        createdAt: {
          order: 'desc'
        }
      };
    } else if (opts.newest === false) {
      delete opts.newest;
      opts.sort = {
        createdAt: {
          order: 'asc'
        }
      };
    }
    delete opts._; // delete anything that may have come from query params but are not handled by ES
    delete opts.apikey;
    if (opts.fields && typeof opts.fields === 'string' && opts.fields.indexOf(',') !== -1) {
      opts.fields = opts.fields.split(',');
    }
    if (opts.random) {
      fq = {
        function_score: {
          random_score: {}
        }
      };
      if (opts.seed != null) {
        fq.function_score.random_score.seed = seed;
      }
      fq.function_score.query = qry.query;
      qry.query = fq; // TODO check how function_score and random seed work now in ES7.x
      delete opts.random;
      delete opts.seed;
    }
    if ((opts._include != null) || (opts.include != null) || (opts._includes != null) || (opts.includes != null) || (opts._exclude != null) || (opts.exclude != null) || (opts._excludes != null) || (opts.excludes != null)) {
      if (qry._source == null) {
        qry._source = {};
      }
      inc = opts._include != null ? '_include' : opts.include != null ? 'include' : opts._includes != null ? '_includes' : 'includes';
      includes = opts[inc];
      if (includes != null) {
        if (typeof includes === 'string') {
          includes = includes.split(',');
        }
        qry._source.includes = includes;
        delete opts[inc];
      }
      exc = opts._exclude != null ? '_exclude' : opts.exclude != null ? 'exclude' : opts._excludes != null ? '_excludes' : 'excludes';
      excludes = opts[exc];
      if (excludes != null) {
        if (typeof excludes === 'string') {
          excludes = excludes.split(',');
        }
        ref7 = includes != null ? includes : [];
        for (u = 0, len4 = ref7.length; u < len4; u++) {
          i = ref7[u];
          if (indexOf.call(excludes, i) >= 0) {
            delete excludes[i];
          }
        }
        qry._source.excludes = excludes;
        delete opts[exc];
      }
    }
    if (opts.and != null) {
      ref8 = opts.and;
      for (w = 0, len5 = ref8.length; w < len5; w++) {
        a = ref8[w];
        qry.query.bool.filter.push(a);
      }
      delete opts.and;
    }
    if (opts.sort != null) {
      if (typeof opts.sort === 'string' && opts.sort.indexOf(',') !== -1) {
        if (opts.sort.indexOf(':') !== -1) {
          os = [];
          ref9 = opts.sort.split(',');
          for (x = 0, len6 = ref9.length; x < len6; x++) {
            ps = ref9[x];
            nos = {};
            nos[ps.split(':')[0]] = {
              order: ps.split(':')[1]
            };
            os.push(nos);
          }
          opts.sort = os;
        } else {
          opts.sort = opts.sort.split(',');
        }
      }
      if (typeof opts.sort === 'string' && opts.sort.indexOf(':') !== -1) {
        os = {};
        os[opts.sort.split(':')[0]] = {
          order: opts.sort.split(':')[1]
        };
        opts.sort = os;
      }
    }
    if ((opts.restrict != null) || (opts.filter != null)) {
      ref11 = (ref10 = opts.restrict) != null ? ref10 : opts.filter;
      for (z = 0, len7 = ref11.length; z < len7; z++) {
        rs = ref11[z];
        qry.query.bool.filter.push(rs);
      }
      delete opts.restrict;
    }
    if ((opts.not != null) || (opts.must_not != null)) {
      tgt = opts.not != null ? 'not' : 'must_not';
      if (Array.isArray(opts[tgt])) {
        qry.query.bool.must_not = opts[tgt];
      } else {
        if ((base3 = qry.query.bool).must_not == null) {
          base3.must_not = [];
        }
        ref12 = opts[tgt];
        for (i1 = 0, len8 = ref12.length; i1 < len8; i1++) {
          nr = ref12[i1];
          qry.query.bool.must_not.push(nr);
        }
      }
      delete opts[tgt];
    }
    if (opts.should != null) {
      if (Array.isArray(opts.should)) {
        qry.query.bool.should = opts.should;
      } else {
        if ((base4 = qry.query.bool).should == null) {
          base4.should = [];
        }
        ref13 = opts.should;
        for (j1 = 0, len9 = ref13.length; j1 < len9; j1++) {
          sr = ref13[j1];
          qry.query.bool.should.push(sr);
        }
      }
      delete opts.should;
    }
    if (opts.all != null) {
      // TODO newer ES doesn't allow more than 10k by default, need to do scan/scroll or whatever the new equivalent is
      qry.size = 1000000; // just a simple way to try to get "all" records - although passing size would be a better solution, and works anyway
      delete opts.all;
    }
    if (opts.terms != null) {
      try {
        opts.terms = opts.terms.split(',');
      } catch (error) {}
      if (qry.aggregations == null) {
        qry.aggregations = {};
      }
      ref14 = opts.terms;
      for (k1 = 0, len10 = ref14.length; k1 < len10; k1++) {
        tm = ref14[k1];
        qry.aggregations[tm] = {
          terms: {
            field: tm + (tm.indexOf('.keyword') === -1 ? '.keyword' : ''),
            size: 1000
          }
        };
      }
      delete opts.terms;
    }
    ref15 = ['aggs', 'aggregations'];
    for (l1 = 0, len11 = ref15.length; l1 < len11; l1++) {
      af = ref15[l1];
      if (opts[af] != null) {
        if (qry[af] == null) {
          qry[af] = {};
        }
        for (f in opts[af]) {
          qry[af][f] = opts[af][f];
        }
        delete opts[af];
      }
    }
    for (k in opts) {
      v = opts[k];
      qry[k] = v;
    }
  }
  // no filter query or no main query can cause issues on some queries especially if certain aggs/terms are present, so insert some default searches if necessary
  //qry.query = { match_all: {} } if typeof qry is 'object' and qry.query? and JSON.stringify(qry.query) is '{}'
  // clean slashes out of query strings
  if (((ref16 = qry.query) != null ? ref16.bool : void 0) != null) {
    for (bm in qry.query.bool) {
      for (b in qry.query.bool[bm]) {
        if (typeof ((ref17 = qry.query.bool[bm][b].query_string) != null ? ref17.query : void 0) === 'string' && qry.query.bool[bm][b].query_string.query.indexOf('/') !== -1 && qry.query.bool[bm][b].query_string.query.indexOf('"') === -1) {
          qry.query.bool[bm][b].query_string.query = '"' + qry.query.bool[bm][b].query_string.query + '"';
        }
      }
    }
  }
  if ((qry._source != null) && (qry.fields != null)) {
    delete qry._source;
  }
  return qry;
};

// https://developers.cloudflare.com/workers/runtime-apis/kv
// Keys are always returned in lexicographically sorted order according to their UTF-8 bytes.
// NOTE these need to be awaited when necessary, as the val will be a Promise

// this could move to server, if never going to be used from worker - would want to run a worker connecting to a somehow remote kv?
if (typeof S.kv === 'string' && S.kv.startsWith('http') && !global[S.kv]) {
  // kv is a URL back to the worker to access cloudflare kv
  global[S.kv] = {};
  global[S.kv].get = function(key) {
    return P.fetch(S.kv + '/' + key);
  };
  global[S.kv].getWithMetadata = async function(key) {
    var ret;
    ret = (await P.fetch(S.kv + '/' + key));
    return {
      value: ret,
      metadata: {} // can't get the metadata remotely
    };
  };
  global[S.kv].put = function(key, data) {
    return P.fetch(S.kv + '/' + key, {
      body: data
    });
  };
  global[S.kv].delete = function(key) {
    return P.fetch(S.kv + '/' + key, {
      method: 'DELETE'
    });
  };
  global[S.kv].list = function(prefix, cursor) {
    return P.fetch(S.kv + '/list' + (prefix ? '/' + prefix : '') + (cursor ? '?cursor=' + cursor : ''));
  };
}

`if typeof S.kv isnt 'string' and S.kv isnt false
global[S.kv] = {}
global[S.kv].get = (key) ->
  ret = await P.index 'kv/' + key.replace /\//g, '_'
  try ret.val = JSON.parse ret.val
  return ret.val
global[S.kv].getWithMetadata = (key) ->
  ret = await P.index 'kv/' + key.replace /\//g, '_'
  try ret.val = JSON.parse ret.val
  return value: ret.val, metadata: {} # can't get the metadata remotely
global[S.kv].put = (key, data) ->
  return await P.index 'kv/' + key.replace(/\//g, '_'), key: key, val: JSON.stringify data
global[S.kv].delete = (key) ->
  return await P.index 'kv/' + key.replace(/\//g, '_'), ''
global[S.kv].list = (prefix, cursor) ->
  # cursor on real kv isnt a from count, but use that for now
  # need to change this to use each properly on index, as from will only go as far as 10k
  ret = await P.index 'kv/', (if prefix then 'key:' + prefix + '*' else '*'), {sort: {key: {order: 'asc'}}, from: cursor}
  res = keys: []
  try
    res.cursor: (cursor ? 0) + 1000
    res.list_complete = true if res.cursor >= ret.hits.total
    for k in ret.hits.hits
      res.keys.push k._source.key
  return res`;

P.kv = async function(key, val, ttle, metadata, type) {
  var i, j, k, len, len1, m, ref, ref1, ref2, ref3, ref4, ref5, ref6, value;
  // val can be string, stream, buffer. The type gets inferred.
  // ONE of expire or ttl can optionally be provided, expiration is seconds since epoch timestamp, ttl is seconds from now until expiry
  // so ttle can be either. If ttle*1000 is greater than Date.now it will be used as expiration timestamp in seconds, otherwise will be used as ttl in seconds
  // ttle can also be true, or an object, to cause a merge of val if val is also an object (true entails retrieving it from storage then merging)
  // metadata and type are not necessary, but included here for completeness
  // metadata can be any JSON object under 1024 bytes
  // type is optional, can be "text", "json", "arrayBuffer" or "stream", and that what the val will be provided as.
  if (key == null) {
    key = (ref = (ref1 = this.params.kv) != null ? ref1 : this.params.key) != null ? ref : this.parts.join('_');
    if (val == null) {
      if (this.request.method === 'DELETE' || this.params._delete) { // TODO this is for easy dev, take out or auth restrict later
        val = '';
      } else if (this.body) {
        val = this.body;
      } else if (this.params.val) {
        val = this.params.val;
      } else {
        val = this.params;
        ref2 = ['key', 'kv', 'refresh', 'apikey'];
        for (i = 0, len = ref2.length; i < len; i++) {
          k = ref2[i];
          delete val[k];
        }
        ref3 = this.parts;
        for (j = 0, len1 = ref3.length; j < len1; j++) {
          k = ref3[j];
          delete val[k];
        }
      }
      if (typeof val === 'string' && (val.indexOf('[') === 0 || val.indexOf('{') === 0)) {
        val = JSON.parse(val);
      }
      if ((ref4 = JSON.stringify(val)) === '{}' || ref4 === '[]') {
        val = void 0;
      }
    }
  }
  if (typeof val === 'object' && ((ref5 = JSON.stringify(val)) === '{}' || ref5 === '[]')) {
    val = void 0;
  }
  if (typeof key === 'object' && (val == null)) {
    val = key;
    key = (ref6 = val._id) != null ? ref6 : (await this.uid());
  }
  if ((key != null) && this.S.kv && global[this.S.kv]) {
    if ((val != null) && val !== '') {
      m = {
        metadata: metadata
      };
      if (typeof ttle === 'number') {
        if ((ttle * 1000) > Date.now()) {
          m.expiration = ttle;
        } else {
          m.expirationTtl = ttle;
        }
      }
      if (typeof val === 'object') { // val needs to be string, arrayBuffer, or readableStream
        if (ttle === true) {
          ttle = (await this.kv(key)); // get the current state of the record
        }
        if (typeof ttle === 'object') { // this is an update to be merged in
// handle dot notations?
          for (k in ttle) {
            if (val[k] == null) {
              val[k] = ttle[k];
            }
          }
        }
      }
      //if @S.kv.indexOf('http') is 0 # has to be a URL route back to the worker
      //  @fetch @S.kv + '/' + key, body: val # send m as well?
      //else
      this.waitUntil(global[this.S.kv].put(key, (typeof val === 'object' ? JSON.stringify(val) : val), m));
      return val;
    } else {
      //if @S.kv.indexOf('http') is 0
      //  return await @fetch @S.kv + '/' + key # any way or need to get metadata here too?
      //else
      ({value, metadata} = (await global[this.S.kv].getWithMetadata(key, type)));
      if (value != null) {
        try {
          value = JSON.parse(value);
        } catch (error) {}
        try {
          metadata = JSON.parse(metadata);
        } catch (error) {}
        if (val === '') {
          this.waitUntil(global[this.S.kv].delete(key)); // remove a key after retrieval
        }
        if (metadata === true) {
          return {
            value: value,
            metadata: metadata
          };
        } else {
          return value;
        }
      } else {
        return void 0;
      }
    }
  } else {
    return void 0;
  }
};

P.kv.list = async function(prefix, cursor) {
  var ref, ref1;
  try {
    if (prefix == null) {
      prefix = (ref = (ref1 = this.params.kv) != null ? ref1 : this.params.prefix) != null ? ref : this.params.list;
    }
  } catch (error) {}
  try {
    if (cursor == null) {
      cursor = this.params.cursor;
    }
  } catch (error) {}
  return (await global[this.S.kv].list({
    prefix: prefix,
    cursor: cursor
  }));
};

// NOTE that count on kv is expensive because it requires listing everything
P.kv.count = async function(prefix) {
  var complete, counter, cursor, i, k, len, ls, ref, ref1, ref2;
  counter = 0;
  if (this.S.kv && (global[this.S.kv] != null)) {
    if (prefix == null) {
      prefix = (ref = (ref1 = this.params.kv) != null ? ref1 : this.params.prefix) != null ? ref : this.params.count;
    }
    complete = false;
    while (!complete) {
      ls = (await global[this.S.kv].list({
        prefix: prefix,
        cursor: cursor
      }));
      cursor = ls.cursor;
      ref2 = ls.keys;
      for (i = 0, len = ref2.length; i < len; i++) {
        k = ref2[i];
        counter += 1;
      }
      complete = ls.list_complete;
    }
  }
  return counter;
};

P.kv._each = async function(prefix, fn, size) {
  var complete, counter, cursor, i, k, len, ls, ref, res, rs;
  res = [];
  if (this.S.kv && (global[this.S.kv] != null)) {
    complete = false;
    counter = 0;
    while (!complete) {
      ls = (await global[this.S.kv].list({
        prefix: prefix,
        cursor: cursor
      }));
      cursor = ls.cursor;
      ref = ls.keys;
      for (i = 0, len = ref.length; i < len; i++) {
        k = ref[i];
        counter += 1;
        if (fn === '') {
          this.waitUntil(this.kv(k.name, ''));
        } else if (typeof fn === 'function') {
          res.push((await fn.call(this, k.name)));
        } else if (fn != null) {
          this.waitUntil(this.kv(k.name, fn));
        } else {
          if (rs = (await this.kv(k.name))) {
            if (rs._id == null) {
              rs._id = k.name; // worthwhile?
            }
            res.push(rs);
          }
        }
      }
      complete = size && counter === size ? true : ls.list_complete;
    }
  }
  return res;
};

// BASE provide a search endpoint, but must register our IP to use it first
// limited to non-commercial and 1 query per second, contact them for more options
// register here: https://www.base-search.net/about/en/contact.php (registered)
// docs here:
// http://www.base-search.net/about/download/base_interface.pdf
P.src.base = {};

P.src.base.doi = async function(doi) {
  //return @src.base.get doi
  return (await this.fetch('https://dev.api.cottagelabs.com/use/base/doi/' + doi));
};

P.src.base.title = async function(title) {
  var ct, ret;
  title = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036F]/g, '').replace(/ß/g, 'ss');
  ret = (await this.src.base.get('dctitle:"' + title + '"'));
  if (((ret != null ? ret.dctitle : void 0) != null) || (ret.title != null)) {
    if (ret.title == null) {
      ret.title = ret.dctitle;
    }
    if (ret.title) {
      ct = ret.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036F]/g, '').replace(/ß/g, 'ss');
      if (ct && ct.length <= title.length * 1.2 && ct.length >= title.length * .8 && title.replace(/ /g, '').indexOf(ct.replace(' ', '').replace(' ', '').replace(' ', '').split(' ')[0]) !== -1) {
        return ret;
      }
    }
  }
  return void 0;
};

P.src.base.get = async function(qry) {
  var ref, res;
  res = (await this.src.base.search(qry));
  if (res != null ? (ref = res.data) != null ? ref.length : void 0 : void 0) {
    return res.data[0];
  } else {
    return void 0;
  }
};

P.src.base.search = async function(qry = '*', from, size) {
  var res, url;
  if (qry.indexOf('"') === -1 && qry.indexOf(' ') !== -1) {
    // it uses offset and hits (default 10) for from and size, and accepts solr query syntax
    // string terms, "" to be next to each other, otherwise ANDed, can accept OR, and * or ? wildcards, brackets to group, - to negate
    //proxy = @S.proxy # need to route through the proxy so requests come from registered IP
    //return undefined if not proxy
    qry = qry.replace(/ /g, '+');
  }
  url = 'https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi?func=PerformSearch&format=json&query=' + qry;
  if (from) { // max 1000
    url += '&offset=' + from;
  }
  if (size) { // max 125
    url += '&hits=' + size;
  }
  url += '&sortBy=dcdate+desc';
  try {
    // add bg true to this as well, or proxy
    res = (await this.fetch(url)); //, {timeout:timeout,npmRequestOptions:{proxy:proxy}}
    res = JSON.parse(res).response;
    res.data = res.docs;
    delete res.docs;
    res.total = res.numFound;
    return res;
  } catch (error) {}
};

// core docs:
// http://core.ac.uk/docs/
// http://core.ac.uk/docs/#!/articles/searchArticles
// http://core.ac.uk:80/api-v2/articles/search/doi:"10.1186/1471-2458-6-309"
P.src.core = {};

P.src.core.doi = function(doi) {
  return this.src.core.get('doi:"' + doi + '"');
};

P.src.core.title = function(title) {
  try {
    title = title.toLowerCase().replace(/(<([^>]+)>)/g, '').replace(/[^a-z0-9 ]+/g, " ").replace(/\s\s+/g, ' ');
  } catch (error) {}
  return this.src.core.get('title:"' + title + '"');
};

P.src.core.get = async function(qrystr) {
  var i, j, len, ref, res, ret;
  ret = (await this.src.core.search(qrystr));
  if (ret != null ? ret.total : void 0) {
    res = ret.data[0];
    ref = ret.data;
    for (j = 0, len = ref.length; j < len; j++) {
      i = ref[j];
      if (i.hasFullText === "true") {
        res = i;
        break;
      }
    }
  }
  return res;
};

P.src.core.search = async function(qrystr, from, size = 10) {
  var apikey, ref, res, url;
  // assume incoming query string is of ES query string format
  // assume from and size are ES typical
  // but core only accepts certain field searches:
  // title, description, fullText, authorsString, publisher, repositoryIds, doi, identifiers, language.name and year
  // for paging core uses "page" from 1 (but can only go up to 100?) and "pageSize" defaulting to 10 but can go up to 100
  apikey = (ref = this.S.src.core) != null ? ref.apikey : void 0;
  if (!apikey) {
    return void 0;
  }
  //var qry = '"' + qrystr.replace(/\w+?\:/g,'') + '"'; # TODO have this accept the above list
  url = 'http://core.ac.uk/api-v2/articles/search/' + qrystr + '?urls=true&apiKey=' + apikey;
  if (size !== 10) {
    url += '&pageSize=' + size;
  }
  if (from) {
    url += '&page=' + (Math.floor(from / size) + 1);
  }
  try {
    res = (await this.fetch(url)); //, {timeout: 10000}
    return {
      total: res.data.totalHits,
      data: res.data.data
    };
  } catch (error) {}
};

  // https://github.com/CrossRef/rest-api-doc/blob/master/rest_api.md
  // http://api.crossref.org/works/10.1016/j.paid.2009.02.013
var _xref_hdr, base, ref,
  indexOf = [].indexOf;

_xref_hdr = {
  'User-Agent': S.name + '; mailto:' + ((ref = S.mail) != null ? ref.to : void 0)
};

if ((base = P.src).crossref == null) {
  base.crossref = {};
}

P.src.crossref.journals = async function(issn) {
  var isq, ref1, res, url;
  // by being an index, should default to a search of the index, then run this query if not present, which should get saved to the index
  if (issn == null) {
    issn = (ref1 = this.params.journals) != null ? ref1 : this.params.issn;
  }
  isq = this.index._q(issn);
  //url = 'https://api.crossref.org/journals?query=' + issn
  url = 'https://dev.api.cottagelabs.com/use/crossref/journals' + (isq ? '?q=' + issn : '/' + issn);
  res = (await this.fetch(url)); //, {headers: _xref_hdr} # TODO check how headers get sent by fetch
  //return if res?.message?['total-results']? and res.message['total-results'].length then res.message['total-results'][0] else undefined
  if (isq) {
    return res;
  } else if ((res != null ? res.ISSN : void 0) != null) {
    return res;
  } else {
    return void 0;
  }
};

//P.src.crossref.journals._index = true
//P.src.crossref.journals._key = 'ISSN'
//P.src.crossref.journals._prefix = false
P.src.crossref.journals.doi = async function(issn) {
  var ref1, res;
  if (issn == null) {
    issn = (ref1 = this.params.doi) != null ? ref1 : this.params.issn;
  }
  if (typeof issn === 'string') {
    issn = issn.split(',');
  }
  try {
    //res = await @src.crossref.works 'ISSN.exact:"' + issn.join('" OR ISSN.exact:"') + '"'
    res = (await this.fetch('https://dev.api.cottagelabs.com/use/crossref/works?q=ISSN.exact:"' + issn.join('" OR ISSN.exact:"') + '"'));
    return res.hits.hits[0]._source.DOI;
  } catch (error) {
    return void 0;
  }
};

P.src.crossref.works = async function(doi) {
  var rec, ref1, ref2, res, url;
  if (doi == null) {
    doi = (ref1 = (ref2 = this.params.works) != null ? ref2 : this.params.doi) != null ? ref1 : this.params.title || this.params.q;
  }
  if (typeof doi === 'string') {
    if (doi.indexOf('10.') !== 0) {
      res = (await this.src.crossref.works.title(doi));
    } else {
      if (doi.indexOf('http') === 0) {
        // a search of an index of works - and remainder of route is a DOI to return one record
        doi = doi.split('//')[1];
      }
      if (doi.indexOf('10.') !== 0 && doi.indexOf('/10.') !== -1) {
        doi = '10.' + doi.split('/10.')[1];
      }
      // for now just get from old system instead of crossref
      //url = 'https://api.crossref.org/works/' + doi
      url = 'https://dev.api.cottagelabs.com/use/crossref/works?doi=' + doi;
      res = (await this.fetch(url)); //, {headers: _xref_hdr}
    }
  }
  if ((res != null ? res.DOI : void 0) != null) {
    rec = (await this.src.crossref.works._prep(res)); //res.data.message
    return rec;
  } else {
    return void 0; //res?.message?.DOI?
  }
};

//P.src.crossref.works._kv = false
P.src.crossref.works._index = {
  settings: {
    number_of_shards: 9
  }
};

P.src.crossref.works._key = 'DOI';

P.src.crossref.works._prefix = false;

// TODO this really should be handled by the main crossref.works function, then 
// the wrapper should query in advance, like it does, but then be able to tell 
// the difference between an actual query and an attempt to get a specific record
P.src.crossref.works.title = async function(title) {
  var i, j, len, len1, ltitle, qr, r, ref1, ref2, ref3, ref4, ref5, rem, res, rt, st, t;
  if (title == null) {
    title = (ref1 = this.params.title) != null ? ref1 : this.params.q;
  }
  qr = 'title:"' + title + '"';
  if (title.split(' ').length > 2) {
    qr += ' OR (';
    ref2 = title.split(' ');
    for (i = 0, len = ref2.length; i < len; i++) {
      t = ref2[i];
      if (!qr.endsWith('(')) {
        qr += ' AND ';
      }
      qr += '(title:"' + t + '" OR subtitle:"' + t + '")';
    }
    qr += ')';
  }
  rem = (await this.fetch('https://dev.api.cottagelabs.com/use/crossref/works?q=' + qr));
  //rem = @src.crossref.works qr
  ltitle = title.toLowerCase().replace(/['".,\/\^&\*;:!\?#\$%{}=\-\+_`~()]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  ref5 = (ref3 = rem != null ? (ref4 = rem.hits) != null ? ref4.hits : void 0 : void 0) != null ? ref3 : [];
  for (j = 0, len1 = ref5.length; j < len1; j++) {
    r = ref5[j];
    if (r._source.DOI && r._source.title && r._source.title.length) {
      rt = (typeof r._source.title === 'string' ? r._source.title : r._source.title[0]).toLowerCase();
      if (r._source.subtitle && r._source.subtitle.length) {
        st = (typeof r._source.subtitle === 'string' ? r._source.subtitle : r._source.subtitle[0]).toLowerCase();
        if (typeof st === 'string' && st.length && indexOf.call(rt, st) < 0) {
          rt += ' ' + st;
        }
      }
      rt = rt.replace(/['".,\/\^&\*;:!\?#\$%{}=\-\+_`~()]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if ((ltitle.indexOf(rt) !== -1 || rt.indexOf(ltitle) !== -1) && ltitle.length / rt.length > 0.7 && ltitle.length / rt.length < 1.3) {
        if (r._source.type === 'journal-article') {
          res = r._source;
        } else if ((res == null) || (res.type !== 'journal-article' && r._source.type === 'journal-article')) {
          res = r._source;
        }
      }
    }
  }
  return res;
};

P.src.crossref.works._prep = function(rec) {
  var a, i, j, k, l, len, len1, len2, p, pbl, ref1, ref2, ref3, ref4, ref5, rp;
  if (rec.abstract) {
    rec.abstract = rec.abstract.replace(/<.*?>/g, '').replace(/^ABSTRACT/, '');
  }
  if (rec._id == null) {
    rec._id = rec.DOI.replace(/\//g, '_');
  }
  ref2 = (ref1 = rec.assertion) != null ? ref1 : [];
  // try to build a published_date and publishedAt field?
  for (i = 0, len = ref2.length; i < len; i++) {
    a = ref2[i];
    if (a.label === 'OPEN ACCESS') {
      if (a.URL && a.URL.indexOf('creativecommons') !== -1) {
        if (rec.license == null) {
          rec.license = [];
        }
        rec.license.push({
          'URL': a.URL
        });
      }
      rec.is_oa = true;
    }
  }
  ref4 = (ref3 = rec.license) != null ? ref3 : [];
  for (j = 0, len1 = ref4.length; j < len1; j++) {
    l = ref4[j];
    if (l.URL && l.URL.indexOf('creativecommons') !== -1 && (!rec.licence || rec.licence.indexOf('creativecommons') === -1)) {
      rec.licence = l.URL;
      try {
        rec.licence = 'cc-' + rec.licence.split('/licenses/')[1].replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
      } catch (error) {}
      rec.is_oa = true;
    }
  }
  try {
    if (rec.reference && rec.reference.length > 200) {
      rec.reference_original_length = rec.reference.length;
      rec.reference = rec.reference.slice(0, 200);
    }
  } catch (error) {}
  try {
    if (rec.relation && rec.relation.length > 100) {
      rec.relation_original_length = rec.relation.length;
      rec.relation = rec.relation.slice(0, 100);
    }
  } catch (error) {}
  ref5 = ['published-print', 'published-online', 'issued', 'deposited', 'indexed'];
  for (k = 0, len2 = ref5.length; k < len2; k++) {
    p = ref5[k];
    if (rec[p]) {
      try {
        if (rec[p]['date-time'] && rec[p]['date-time'].split('T')[0].split('-').length === 3) {
          if (rec.published == null) {
            rec.published = rec[p]['date-time'].split('T')[0];
          }
          if (rec.published != null) {
            if (rec.year == null) {
              rec.year = rec.published.split('-')[0];
            }
          }
        }
        pbl = '';
        if (rec[p]['date-parts'] && rec[p]['date-parts'].length && rec[p]['date-parts'][0]) {
          rp = rec[p]['date-parts'][0];
          pbl = rp[0];
          if (pbl && pbl !== 'null') {
            if (rp.length === 1) {
              pbl += '-01-01';
            } else {
              pbl += rp.length > 1 ? '-' + (rp[1].toString().length === 1 ? '0' : '') + rp[1] : '-01';
              pbl += rp.length > 2 ? '-' + (rp[2].toString().length === 1 ? '0' : '') + rp[2] : '-01';
            }
            if (!rec.published) {
              rec.year = pbl.split('-')[0];
            }
            if (rec.publishedAt == null) {
              rec.publishedAt = rec[p].timestamp;
            }
          }
        }
      } catch (error) {}
    }
  }
  return rec;
};

P.src.doaj = {};

P.src.doaj.journals = async function(issn) {
  var ref, res;
  if (issn == null) {
    issn = (ref = this.params.journals) != null ? ref : this.params.issn;
  }
  if (issn) {
    try {
      res = (await this.fetch('https://doaj.org/api/v2/search/journals/' + issn));
      return res.results[0];
    } catch (error) {}
  }
};

P.src.doaj.articles = async function(qry) {
  var op, ref, res, title, url;
  url = 'https://doaj.org/api/v1/search/articles';
  try {
    title = this.params.title.toLowerCase().replace(/(<([^>]+)>)/g, '').replace(/[^a-z0-9 ]+/g, " ").replace(/\s\s+/g, ' ');
  } catch (error) {}
  if (title || typeof qry === 'string') {
    if (qry.startsWith('10.')) {
      qry += 'doi:';
    }
    url += (ref = '/' + title) != null ? ref : qry;
  } else {
    url += '?';
    for (op in params) {
      url += op + '=' + params[op] + '&';
    }
  }
  res = (await this.fetch(url)); // note for DOAJ this needs a 300ms limiter
  return res.results;
};

// Europe PMC client
// https://europepmc.org/RestfulWebService
// https://www.ebi.ac.uk/europepmc/webservices/rest/search/
// https://europepmc.org/Help#fieldsearch

// GET https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1007/bf00197367&resulttype=core&format=json
// default page is 1 and default pageSize is 25
// resulttype lite is smaller, lacks so much metadata, no mesh, terms, etc
// open_access:y added to query will return only open access articles, and they will have fulltext xml available at a link like the following:
// https://www.ebi.ac.uk/europepmc/webservices/rest/PMC3257301/fullTextXML
// can also use HAS_PDF:y to get back ones where we should expect to be able to get a pdf, but it is not clear if those are OA and available via eupmc
// can ensure a DOI is available using HAS_DOI
// can search publication date via FIRST_PDATE:1995-02-01 or FIRST_PDATE:[2000-10-14 TO 2010-11-15] to get range
P.src.epmc = async function(qrystr, from, size) {
  var ref, ref1, ref2, res, ret, url;
  if (qrystr == null) {
    qrystr = (ref = this.params.epmc) != null ? ref : this.params.doi;
  }
  if (qrystr.indexOf('10.') === 0 && qrystr.indexOf(' ') === -1 && qrystr.split('/').length >= 2) {
    qrystr = 'DOI:' + qrystr;
  }
  url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=' + qrystr + ' sort_date:y&resulttype=core&format=json';
  if (size != null) {
    url += '&pageSize=' + size; //can handle 1000, have not tried more, docs do not say
  }
  if (from != null) {
    url += '&cursorMark=' + from; // used to be a from pager, but now uses a cursor
  }
  ret = {};
  res = (await this.fetch(url));
  ret.total = res.hitCount;
  ret.data = (ref1 = (ref2 = res.resultList) != null ? ref2.result : void 0) != null ? ref1 : [];
  ret.cursor = res.nextCursorMark;
  if (this.params.doi && ret.total === 1) {
    return ret.data[0];
  } else {
    return ret;
  }
};

P.src.epmc.doi = async function(ident) {
  var res;
  if (ident == null) {
    ident = this.params.doi;
  }
  res = (await this.src.epmc('DOI:' + ident));
  if (res.total) {
    return res.data[0];
  } else {
    return void 0;
  }
};

P.src.epmc.doi._hidden = true;

P.src.epmc.pmid = async function(ident) {
  var res;
  if (ident == null) {
    ident = this.params.pmid;
  }
  res = (await this.src.epmc('EXT_ID:' + ident + ' AND SRC:MED'));
  if (res.total) {
    return res.data[0];
  } else {
    return void 0;
  }
};

P.src.epmc.pmc = async function(ident) {
  var res;
  res = (await this.src.epmc('PMCID:PMC' + ident.toLowerCase().replace('pmc', '')));
  if (res.total) {
    return res.data[0];
  } else {
    return void 0;
  }
};

P.src.epmc.title = async function(title) {
  var res;
  if (title == null) {
    title = this.params.title;
  }
  try {
    title = title.toLowerCase().replace(/(<([^>]+)>)/g, '').replace(/[^a-z0-9 ]+/g, " ").replace(/\s\s+/g, ' ');
  } catch (error) {}
  res = (await this.src.epmc('title:"' + title + '"'));
  if (res.total) {
    return res.data[0];
  } else {
    return void 0;
  }
};

P.src.epmc.licence = async function(pmcid, rec, fulltext) {
  var licanywhere, licinapi, licinperms, licsplash, maybe_licence, pg, ref, res, url;
  if (pmcid == null) {
    pmcid = (ref = this.params.licence) != null ? ref : this.params.pmcid;
  }
  maybe_licence;
  if (pmcid && !rec) {
    res = (await this.src.epmc('PMC' + pmcid.toLowerCase().replace('pmc', '')));
  }
  if ((res != null ? res.total : void 0) > 0 || rec || fulltext) {
    if (rec == null) {
      rec = res.data[0];
    }
    if (!pmcid && rec) {
      pmcid = rec.pmcid;
    }
    if (rec.license) {
      licinapi = {
        licence: rec.license,
        source: 'epmc_api'
      };
      if (licinapi.licence.indexOf('cc') === 0) {
        licinapi.licence = licinapi.licence.replace(/ /g, '-');
      }
      return licinapi;
    }
    if (!fulltext && pmcid) {
      fulltext = (await this.src.epmc.xml(pmcid));
    }
    if (fulltext !== 404 && typeof fulltext === 'string' && fulltext.indexOf('<') === 0 && (this.svc.lantern != null)) {
      licinperms = (await this.svc.lantern.licence(void 0, void 0, fulltext, '<permissions>', '</permissions>'));
      if (licinperms.licence != null) {
        licinperms.source = 'epmc_xml_permissions';
        return licinperms;
      }
      licanywhere = (await this.svc.lantern.licence(void 0, void 0, fulltext));
      if (licanywhere.licence != null) {
        licanywhere.source = 'epmc_xml_outside_permissions';
        return licanywhere;
      }
      if (fulltext.indexOf('<permissions>') !== -1) {
        maybe_licence = {
          licence: 'non-standard-licence',
          source: 'epmc_xml_permissions'
        };
      }
    }
    if (false) { //pmcid and @svc?.lantern?.licence?
      // TODO need a 3s rate limit
      url = 'https://europepmc.org/articles/PMC' + pmcid.toLowerCase().replace('pmc', '');
      pg = (await this.puppet(url));
      if (typeof pg === 'string') {
        try {
          licsplash = (await this.svc.lantern.licence(url, false, pg));
        } catch (error) {}
        if ((licsplash != null ? licsplash.licence : void 0) != null) {
          licsplash.source = 'epmc_html';
          return licsplash;
        }
      }
    }
    return maybe_licence != null ? maybe_licence : false;
  } else {
    return false;
  }
};

P.src.epmc.xml = function(pmcid) {
  var ref;
  if (pmcid == null) {
    pmcid = (ref = this.params.xml) != null ? ref : this.params.pmcid;
  }
  if (pmcid) {
    pmcid = pmcid.toLowerCase().replace('pmc', '');
  }
  return this.fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/PMC' + pmcid + '/fullTextXML');
};

P.src.epmc.aam = async function(pmcid, rec, fulltext) {
  var pg, ref, s1, s2, s3, s4;
  if (pmcid == null) {
    pmcid = (ref = this.params.xml) != null ? ref : this.params.pmcid;
  }
  if (typeof fulltext === 'string' && fulltext.indexOf('pub-id-type=\'manuscript\'') !== -1 && fulltext.indexOf('pub-id-type="manuscript"') !== -1) {
    return {
      aam: true,
      info: 'fulltext'
    };
  } else {
    // if EPMC API authMan / epmcAuthMan / nihAuthMan become reliable we can use those instead
    //rec = @src.epmc.search('PMC' + pmcid.toLowerCase().replace('pmc',''))?.data?[0] if pmcid and not rec
    if (pmcid == null) {
      pmcid = rec != null ? rec.pmcid : void 0;
    }
    if (pmcid) {
      fulltext = (await this.src.epmc.xml(pmcid));
      if (typeof fulltext === 'string' && fulltext.indexOf('pub-id-type=\'manuscript\'') !== -1 && fulltext.indexOf('pub-id-type="manuscript"') !== -1) {
        return {
          aam: true,
          info: 'fulltext'
        };
      } else if (false) {
        // NOTE to enable this it needs a 3s rate limit
        pg = (await this.puppet('https://europepmc.org/articles/PMC' + pmcid.toLowerCase().replace('pmc', '')));
        if (pg == null) {
          return {
            aam: false,
            info: 'not in EPMC (404)'
          };
        } else if (typeof pg === 'string') {
          s1 = 'Author Manuscript; Accepted for publication in peer reviewed journal';
          s2 = 'Author manuscript; available in PMC';
          s3 = 'logo-nihpa.gif';
          s4 = 'logo-wtpa2.gif';
          if (pg.indexOf(s1) !== -1 || pg.indexOf(s2) !== -1 || pg.indexOf(s3) !== -1 || pg.indexOf(s4) !== -1) {
            return {
              aam: true,
              info: 'splashpage'
            };
          } else {
            return {
              aam: false,
              info: 'EPMC splashpage checked, no indicator found'
            };
          }
        } else if (typeof pg === 'object' && pg.status === 403) {
          return {
            info: 'EPMC blocking access, AAM status unknown'
          };
        } else if (pg != null) {
          return {
            info: 'EPMC was accessed but aam could not be decided from what was returned'
          };
        } else {
          return {
            info: 'EPMC was accessed nothing was returned, so aam check could not be performed'
          };
        }
      }
    }
  }
  return {
    aam: false,
    info: ''
  };
};

// https://search.fatcat.wiki/fatcat_release_v03b/_search?q=doi:%2210.1007/s00276-005-0333-8%22
// that used to work, but they've moved the index now, and it doesn't seem to. Althought the main 
// ES base is still there - just can't get it to respond without finding the index name. 
// However, developments on querying the releases gives us a possible solution:
P.src.fatcat = async function(doi) {
  var ref, res;
  if (doi == null) {
    doi = (ref = this.params.fatcat) != null ? ref : this.params.doi;
  }
  try {
    res = (await this.fetch('https://api.fatcat.wiki/v0/release/lookup?expand=files&hide=abstracts,refs&doi=' + doi));
    return res;
  } catch (error) {
    return void 0;
  }
};

// is there also a title search? Or only IDs? title= doesn't work. Can explore more later.

// we could index this as we get them if that turns out to be useful
// to begin with, normal caching should be sufficient.
` for example:
10.1088/0264-9381/19/7/380
has a files section, containing:
[
   {
     "release_ids":["3j36alui7fcwncbc4xdaklywb4"],
     "mimetype":"application/pdf",
     "urls":[
       {"url":"http://www.gravity.uwa.edu.au/amaldi/papers/Landry.pdf","rel":"web"},
       {"url":"https://web.archive.org/web/20091024040004/http://www.gravity.uwa.edu.au/amaldi/papers/Landry.pdf","rel":"webarchive"},
       {"url":"https://web.archive.org/web/20040827040202/http://www.gravity.uwa.edu.au:80/amaldi/papers/Landry.pdf","rel":"webarchive"},
       {"url":"https://web.archive.org/web/20050624182645/http://www.gravity.uwa.edu.au/amaldi/papers/Landry.pdf","rel":"webarchive"},
       {"url":"https://web.archive.org/web/20050601001748/http://www.gravity.uwa.edu.au:80/amaldi/papers/Landry.pdf","rel":"webarchive"}
     ],
     "state":"active"
     ...
   },
   ...
 ]`;

// https://developers.google.com/custom-search/json-api/v1/overview#Pricing
// note technically meant to be targeted to a site but can do full search on free tier
// free tier only up to 100 queries a day. After that, $5 per 1000, up to 10k
// has to come from registered IP address
P.src.google = async function(q, id, key) {
  var ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, ref8, url;
  if (q == null) {
    q = (ref = this != null ? (ref1 = this.params) != null ? ref1.q : void 0 : void 0) != null ? ref : this != null ? (ref2 = this.params) != null ? ref2.google : void 0 : void 0;
  }
  if (id == null) {
    id = (ref3 = this.S.src.google) != null ? (ref4 = ref3.secrets) != null ? (ref5 = ref4.search) != null ? ref5.id : void 0 : void 0 : void 0;
  }
  if (key == null) {
    key = (ref6 = this.S.src.google) != null ? (ref7 = ref6.secrets) != null ? (ref8 = ref7.search) != null ? ref8.key : void 0 : void 0 : void 0;
  }
  if (q && id && key) {
    url = 'https://www.googleapis.com/customsearch/v1?key=' + key + '&cx=' + id + '&q=' + q;
    return (await this.fetch(url));
  } else {
    return {};
  }
};

P.src.google.sheets = async function(opts) {
  var g, k, keys, l, ref, ref1, ref2, url, val, values;
  // expects a google sheet ID or a URL to a google sheets feed in json format
  // NOTE the sheet must be published for this to work, should have the data in sheet 1, and should have columns of data with key names in row 1
  if (opts == null) {
    opts = (ref = this != null ? this.params : void 0) != null ? ref : {};
  }
  if (typeof opts === 'string') {
    opts = {
      sheetid: opts
    };
  }
  if (((opts.sheets != null) || (opts.sheet != null)) && (opts.sheetid == null)) {
    opts.sheetid = (ref1 = opts.sheet) != null ? ref1 : opts.sheets;
    delete opts.sheet;
    delete opts.sheets;
  }
  values = [];
  if (!opts.sheetid) {
    return values;
  } else if (opts.sheetid.indexOf('http') === 0) {
    url = opts.sheetid;
  } else {
    if (opts.sheetid.indexOf('/spreadsheets/d/') !== -1) {
      opts.sheetid = opts.sheetid.split('/spreadsheets/d/')[1].split('/')[0];
    } else if (opts.sheetid.split('/').length === 2) {
      [opts.sheetid, opts.sheet] = opts.sheetid.split('/');
    }
    if (opts.sheet == null) {
      opts.sheet = 'default'; // or else a number, starting from 1, indicating which sheet in the overall sheet to access
    }
    url = 'https://spreadsheets.google.com/feeds/list/' + opts.sheetid + '/' + opts.sheet + '/public/values?alt=json';
  }
  g = (await this.fetch(url, {
    headers: {
      'Cache-Control': 'no-cache'
    }
  }));
  for (l in g.feed.entry) {
    val = {};
    for (k in g.feed.entry[l]) {
      try {
        if (k.indexOf('gsx$') === 0 && (g.feed.entry[l][k].$t != null) && g.feed.entry[l][k].$t !== '') {
          val[k.replace('gsx$', '')] = g.feed.entry[l][k].$t;
        }
      } catch (error) {}
    }
    keys = this.keys(val);
    if (keys.length > 1 || (keys.length && ((ref2 = val[keys[0]]) !== 'Loading...' && ref2 !== '#REF!'))) {
      values.push(val);
    }
  }
  g = void 0;
  return values;
};

P.src.google.sheets._bg = true;

//P.src.google.sheets._async = true

// https://developers.google.com/hangouts/chat
// NOTE this will need oauth configuration for a full bot. For now just a web hook
// https://developers.google.com/hangouts/chat/how-tos/webhooks	
// pradm dev "pradm alert" google chat webhook
P.src.google.chat = function(params, url) {
  var data, headers, ref, ref1, ref2, ref3, ref4;
  if (typeof params === 'string') {
    params = {
      text: params
    };
  }
  if (params == null) {
    params = this.params;
  }
  headers = {
    "Content-Type": 'application/json; charset=UTF-8' // any other possible headers?
  };
  data = {
    method: 'POST',
    headers: headers,
    body: {
      text: decodeURIComponent((ref = (ref1 = (ref2 = params.text) != null ? ref2 : params.msg) != null ? ref1 : params.body) != null ? ref : '')
    }
  };
  if (url == null) {
    url = (ref3 = this.S.src.google) != null ? (ref4 = ref3.secrets) != null ? ref4.chat : void 0 : void 0; // should url be allowed on params? doesn't strictly need to be secret, the key and token it uses only work for the webhook
  }
  if (data.body.text && (url != null)) {
    return this.fetch(url, data);
  } else {
    return void 0;
  }
};

`# docs:
# https://developers.google.com/places/web-service/autocomplete
# example:
# https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Aberdeen%20Asset%20Management%20PLC&key=<OURKEY>


# https://developers.google.com/knowledge-graph/
# https://developers.google.com/knowledge-graph/reference/rest/v1/
API.use.google.knowledge.retrieve = (mid,types) ->
  exists = API.http.cache {mid:mid,types:types}, 'google_knowledge_retrieve'
  return exists if exists
  u = 'https://kgsearch.googleapis.com/v1/entities:search?key=' + API.settings.use.google.serverkey + '&limit=1&ids=' + mid
  if types
    types = types.join('&types=') if typeof types isnt 'string' # are multiple types done by comma separation or key repetition?
    u += '&types=' + types
  ret = {}
  try
    res = API.http.proxy 'GET', u, true
    ret = res.data.itemListElement[0].result
    ret.score = res.data.itemListElement[0].resultScore
  if not _.isEmpty ret
    API.http.cache {mid:mid,types:types}, 'google_knowledge_retrieve', ret
  return ret

API.use.google.knowledge.search = (qry,limit=10,refresh=604800000) -> # default 7 day cache
  u = 'https://kgsearch.googleapis.com/v1/entities:search?key=' + API.settings.use.google.serverkey + '&limit=' + limit + '&query=' + encodeURIComponent qry
  API.log 'Searching google knowledge for ' + qry

  checksum = API.job.sign qry
  exists = API.http.cache checksum, 'google_knowledge_search', undefined, refresh
  return exists if exists

  res = API.http.proxy('GET',u,true).data
  try API.http.cache checksum, 'google_knowledge_search', res
  return res

API.use.google.knowledge.find = (qry) ->
  res = API.use.google.knowledge.search qry
  try
    return res.itemListElement[0].result #could add an if resultScore > ???
  catch
    return undefined

# https://cloud.google.com/natural-language/docs/getting-started
# https://cloud.google.com/natural-language/docs/basics
API.use.google.cloud.language = (content, actions=['entities','sentiment'], auth) ->
  actions = actions.split(',') if typeof actions is 'string'
  return {} if not content?
  checksum = API.job.sign content, actions
  exists = API.http.cache checksum, 'google_language'
  return exists if exists

  lurl = 'https://language.googleapis.com/v1/documents:analyzeEntities?key=' + API.settings.use.google.serverkey
  document = {document: {type: "PLAIN_TEXT",content:content},encodingType:"UTF8"}
  result = {}
  if 'entities' in actions
    try result.entities = API.http.proxy('POST',lurl,{data:document,headers:{'Content-Type':'application/json'}},true).data.entities
  if 'sentiment' in actions
    try result.sentiment = API.http.proxy('POST',lurl.replace('analyzeEntities','analyzeSentiment'),{data:document,headers:{'Content-Type':'application/json'}},true).data
  API.http.cache(checksum, 'google_language', result) if not _.isEmpty result
  return result

# https://cloud.google.com/translate/docs/quickstart
API.use.google.cloud.translate = (q, source, target='en', format='text') ->
  # ISO source and target language codes
  # https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
  return {} if not q?
  checksum = API.job.sign q, {source: source, target: target, format: format}
  exists = API.http.cache checksum, 'google_translate'
  return exists if exists
  lurl = 'https://translation.googleapis.com/language/translate/v2?key=' + API.settings.use.google.serverkey
  result = API.http.proxy('POST', lurl, {data:{q:q, source:source, target:target, format:format}, headers:{'Content-Type':'application/json'}},true)
  if result?.data?.data?.translations
    res = result.data.data.translations[0].translatedText
    API.http.cache(checksum, 'google_language', res) if res.length
    return res
    #return result.data.data
  else
    return {}

API.use.google.places.autocomplete = (qry,location,radius) ->
  url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=' + qry + '&key=' + API.settings.use.google.serverkey
  url += '&location=' + location + '&radius=' + (radius ? '10000') if location?
  try
    return API.http.proxy('GET',url,true).data
  catch err
  return {status:'error', error: err}

API.use.google.places.place = (id,qry,location,radius) ->
  if not id?
    try
      results = API.use.google.places.autocomplete qry,location,radius
      id = results.predictions[0].place_id
    catch err
      return {status:'error', error: err}
  url = 'https://maps.googleapis.com/maps/api/place/details/json?placeid=' + id + '&key=' + API.settings.use.google.serverkey
  try
    return API.http.proxy('GET',url,true).data
  catch err
    return {status:'error', error: err}

API.use.google.places.url = (qry) ->
  try
    results = API.use.google.places.place undefined,qry
    return {data: {url:results.result.website.replace('://','______').split('/')[0].replace('______','://')}}
  catch err
    return {status:'error', error: err}

API.use.google.places.nearby = (params={}) ->
  url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json?'
  params.key ?= API.settings.use.google.serverkey
  url += (if p is 'q' then 'input' else p) + '=' + params[p] + '&' for p of params
  try
    return API.http.proxy('GET',url,true).data
  catch err
    return {status:'error', error: err}

API.use.google.places.search = (params) ->
  url = 'https://maps.googleapis.com/maps/api/place/textsearch/json?'
  params.key ?= API.settings.use.google.serverkey
  url += (if p is 'q' then 'input' else p) + '=' + params[p] + '&' for p of params
  try
    return API.http.proxy('GET',url,true).data
  catch err
    return {status:'error', error: err}

API.use.google.sheets.api = {}
# https://developers.google.com/sheets/api/reference/rest
API.use.google.sheets.api.get = (sheetid, opts={}) ->
  opts = {stale:opts} if typeof opts is 'number'
  opts.stale ?= 3600000
  opts.key ?= API.settings.use.google.serverkey
  try
    sheetid = sheetid.split('/spreadsheets/d/')[1].split('/')[0] if sheetid.indexOf('/spreadsheets/d/') isnt -1
    url = 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetid
    url += '/values/' + opts.start + ':' + opts.end if opts.start and opts.end
    url += '?key=' + opts.key
    API.log 'Getting google sheet via API ' + url
    g = HTTP.call 'GET', url
    return g.data ? g
  catch err
    return err

# auth for sheets interactions that makes changes is complex, requiring oauth and an email account to be registered to the sheet, it seems
# https://developers.google.com/sheets/api/guides/authorizing
# https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append
# https://developers.google.com/identity/protocols/oauth2
# https://developers.google.com/sheets/api/quickstart/nodejs#step_3_set_up_the_sample
# https://cloud.google.com/apigee/docs/api-platform/security/oauth/access-tokens
# https://docs.wso2.com/display/IntegrationCloud/Get+Credentials+for+Google+Spreadsheet
# https://help.gooddata.com/doc/en/building-on-gooddata-platform/data-preparation-and-distribution/additional-data-load-reference/data-load-tutorials/load-data-from-google-spreadsheets-via-google-api
# https://isd-soft.com/tech_blog/accessing-google-apis-using-service-account-node-js/
API.use.google.sheets.api.values = (sheetid, opts={}) ->
  opts.start ?= 'A1'
  if not opts.end?
    sheet = if typeof sheetid is 'object' then sheetid else API.use.google.sheets.api.get sheetid, opts
    opts.sheet ?= 0 # could also be the ID or title of a sheet in the sheet... if so iterate them to find the matching one
    rows = sheet.sheets[opts.sheet].properties.gridProperties.rowCount
    cols = sheet.sheets[opts.sheet].properties.gridProperties.columnCount
    opts.end = ''
    ls = Math.floor cols/26
    opts.end += (ls + 9).toString(36).toUpperCase() if ls isnt 0
    opts.end += (cols + 9-ls).toString(36).toUpperCase()
    opts.end += rows
  values = []
  try
    keys = false
    res = API.use.google.sheets.api.get sheetid, opts
    opts.keys ?= 0 # always assume keys? where to tell which row to get them from? 0-indexed or 1-indexed or named?
    keys = opts.keys if Array.isArray opts.keys
    for s in res.values
      if opts.keys? and keys is false
        keys = s
      else
        obj = {}
        for k of keys
          try
            obj[keys[k]] = s[k] if s[k] isnt ''
        values.push(obj) if not _.isEmpty obj
    return values
	`;

// Docs: https://europepmc.org/GristAPI
// Fields you can search by: https://europepmc.org/GristAPI#API

// Example, get info by grant ID: http://www.ebi.ac.uk/europepmc/GristAPI/rest/get/query=gid:088130&resultType=core&format=json
// Use case: To get the name of a Principal Investigator, call @src.grist(the_grant_id).data.Person
// Will return {FamilyName: "Friston", GivenName: "Karl", Initials: "KJ", Title: "Prof"}
P.src.grist = async function(qrystr, from) {
  var ref, ref1, res, url;
  // note in Grist API one of the params is resultType, in EPMC REST API the same param is resulttype .
  if (qrystr == null) {
    qrystr = this.params.grist;
  }
  if (qrystr.indexOf('gid:') !== 0 && qrystr.indexOf(' ') === -1 && parseInt(qrystr)) {
    qrystr = 'gid:' + qrystr; // check the qrystr to decide if this should be added or not
  }
  url = 'https://www.ebi.ac.uk/europepmc/GristAPI/rest/get/query=' + encodeURIComponent(qrystr) + '&resultType=core&format=json';
  if (from != null) {
    url += '&page=' + (Math.floor(from / 25) + 1);
  }
  res = (await this.fetch(url));
  return {
    total: res.HitCount,
    data: (ref = (ref1 = res.RecordList) != null ? ref1.Record : void 0) != null ? ref : {}
  };
};

var base;

if ((base = S.src).microsoft == null) {
  base.microsoft = {};
}

try {
  S.src.microsoft.secrets = JSON.parse(SECRETS_MICROSOFT);
} catch (error) {}

P.src.microsoft = {};

// https://docs.microsoft.com/en-gb/rest/api/cognitiveservices/bing-web-api-v7-reference#endpoints
// annoyingly Bing search API does not provide exactly the same results as the actual Bing UI.
// and it seems the bing UI is sometimes more accurate
P.src.microsoft.bing = async function(q, key) {
  var ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, ref8, res, url;
  if (q == null) {
    q = (ref = (ref1 = this != null ? (ref2 = this.params) != null ? ref2.bing : void 0 : void 0) != null ? ref1 : this != null ? (ref3 = this.params) != null ? ref3.q : void 0 : void 0) != null ? ref : this != null ? (ref4 = this.params) != null ? ref4.query : void 0 : void 0;
  }
  if (key == null) {
    key = (ref5 = S.src.microsoft) != null ? (ref6 = ref5.secrets) != null ? (ref7 = ref6.bing) != null ? ref7.key : void 0 : void 0 : void 0;
  }
  url = 'https://api.cognitive.microsoft.com/bing/v7.0/search?mkt=en-GB&count=20&q=' + q;
  res = (await this.fetch(url, {
    headers: {
      'Ocp-Apim-Subscription-Key': key // TODO set a long cache time on it
    }
  }));
  if (res != null ? (ref8 = res.webPages) != null ? ref8.value : void 0 : void 0) {
    return {
      total: res.data.webPages.totalEstimatedMatches,
      data: res.data.webPages.value
    };
  } else {
    return {
      total: 0,
      data: []
    };
  }
};

// https://docs.microsoft.com/en-us/academic-services/graph/reference-data-schema
// We get files via MS Azure dump and run an import script. Have to manually go to 
// Azure, use storage explorer to find the most recent blob container, select the file(s)
// to download, right click and select shared access signature, create it, copy it, and download that.
// THEN DELETE THE BLOB BECAUSE THEY CHARGE US FOR EVERY CREATION, EVERY DOWNLOAD, AND STORAGE TIME FOR AS LONG AS IT EXISTS
// Fields we get are:
// 'journal': ['JournalId', 'Rank', 'NormalizedName', 'DisplayName', 'Issn', 'Publisher', 'Webpage', 'PaperCount', 'PaperFamilyCount', 'CitationCount', 'CreatedDate'],
// 'author': ['AuthorId', 'Rank', 'NormalizedName', 'DisplayName', 'LastKnownAffiliationId', 'PaperCount', 'PaperFamilyCount', 'CitationCount', 'CreatedDate'],
// 'paper': ['PaperId', 'Rank', 'Doi', 'DocType', 'PaperTitle', 'OriginalTitle', 'BookTitle', 'Year', 'Date', 'OnlineDate', 'Publisher', 'JournalId', 'ConferenceSeriesId', 'ConferenceInstanceId', 'Volume', 'Issue', 'FirstPage', 'LastPage', 'ReferenceCount', 'CitationCount', 'EstimatedCitation', 'OriginalVenue', 'FamilyId', 'FamilyRank', 'CreatedDate'],
// 'affiliation': ['AffiliationId', 'Rank', 'NormalizedName', 'DisplayName', 'GridId', 'OfficialPage', 'Wikipage', 'PaperCount', 'PaperFamilyCount', 'CitationCount', 'Iso3166Code', 'Latitude', 'Longitude', 'CreatedDate'],
// 'relation': ['PaperId', 'AuthorId', 'AffiliationId', 'AuthorSequenceNumber', 'OriginalAuthor', 'OriginalAffiliation']
// of about 49k journals about 9 are dups, 37k have ISSN. 32k were already known from other soruces. Of about 250m papers, about 99m have DOIs
P.src.microsoft.graph = async function(q) {
  var _append, longest, lvs, paper, ref, ref1, ref2, ref3, res, rt, title;
  // NOTE: although there are about 250m papers only about 90m have JournalId - the rest could be books, etc. Import them all?
  _append = async function(rec) {
    var j;
    if (rec.JournalId) {
      j = (await this.src.microsoft.graph.journal(rec.JournalId));
      if (j) {
        rec.journal = j;
      }
    }
    //if ma = await @src.microsoft.graph.abstract rec.PaperId
    //  rec.abstract = ma
    //rec.relation = await @src.microsoft.graph._relations rec.PaperId, false, false
    return rec;
  };
  if (q == null) {
    q = (ref = (ref1 = (ref2 = this.params.graph) != null ? ref2 : this.params.doi) != null ? ref1 : this.params.title) != null ? ref : this.params;
  }
  if (typeof q === 'number') { // an MS ID like 2517073914 may turn up as number, if so convert to string
    q = q.toString();
  }
  if (typeof q === 'string' && q.indexOf('/') !== -1 && q.indexOf('10.') === 0 && (paper = (await this.src.microsoft.graph.paper('Doi.exact:"' + q + '"')))) {
    return (await _append(paper));
  } else if (typeof q === 'string' && q.indexOf(' ') === -1 && q.length === 10 && (paper = (await this.src.microsoft.graph.paper(q)))) {
    return (await _append(paper));
  } else if (typeof q === 'string' && q.indexOf(' ') !== -1) {
    title = q.toLowerCase().replace(/['".,\/\^&\*;:!\?#\$%{}=\-\+_`~()]/g, ' ').replace(/\s{2,}/g, ' ').trim(); // MAG PaperTitle is lowercased. OriginalTitle isnt
    res = (await this.src.microsoft.graph.paper('PaperTitle:"' + title + '"'));
    if (res != null ? res.PaperTitle : void 0) {
      rt = res.PaperTitle.replace(/['".,\/\^&\*;:!\?#\$%{}=\-\+_`~()]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (typeof (this != null ? (ref3 = this.tdm) != null ? ref3.levenshtein : void 0 : void 0) === 'function') {
        lvs = (await this.tdm.levenshtein(title, rt, false));
        longest = lvs.length.a > lvs.length.b ? lvs.length.a : lvs.length.b;
        if (lvs.distance < 2 || longest / lvs.distance > 10) {
          //res.relation = await @src.microsoft.graph._relations res.PaperId
          return res;
        } else {
          return void 0;
        }
      } else if (title.length < (rt.length * 1.2) && (title.length > rt.length * .8)) {
        //res.relation = await @src.microsoft.graph._relations res.PaperId
        return res;
      }
    }
    return void 0;
  } else {
    return (await this.src.microsoft.graph.paper(q));
  }
};

P.src.microsoft.graph.paper = async function(q) {
  var ref, res, url;
  // for now just get from old index
  url = 'https://dev.api.cottagelabs.com/use/microsoft/graph/paper/?q=' + q;
  res = (await this.fetch(url));
  if (res != null ? (ref = res.hits) != null ? ref.total : void 0 : void 0) {
    return res.hits.hits[0]._source;
  } else {
    return void 0;
  }
};

P.src.microsoft.graph.journal = async function(q) {
  var res, url;
  // for now just get from old index
  url = 'https://dev.api.cottagelabs.com/use/microsoft/graph/journal/' + q;
  res = (await this.fetch(url));
  return res;
};

`P.src.microsoft.graph.paper = _index: true # TODO check how API init will pick up an index that has no main function
P.src.microsoft.graph.journal = _index: true
P.src.microsoft.graph.author = _index: true
P.src.microsoft.graph.affiliation = _index: true
P.src.microsoft.graph.abstract = _index: true
P.src.microsoft.graph.relation = _index: true`;

`P.src.microsoft.graph._relations = (q, papers=true, authors=true, affiliations=true) ->
 # ['PaperId', 'AuthorId', 'AffiliationId', 'AuthorSequenceNumber', 'OriginalAuthor', 'OriginalAffiliation']
 # context could be paper, author, affiliation
  results = []
  _append = (recs) ->
    res = []
    recs = [recs] if not Array.isArray recs
    for rec in recs
      rec.paper = await @src.microsoft.graph.paper(rec.PaperId) if rec.PaperId and papers
      rec.author = await @src.microsoft.graph.author(rec.AuthorId) if rec.AuthorId and authors
      rec.affiliation = await @src.microsoft.graph.affiliation(rec.AffiliationId ? rec.LastKnownAffiliationId) if (rec.AffiliationId or rec.LastKnownAffiliationId) and affiliations
      if rec.GridId or rec.affiliation?.GridId
        try rec.ror = await @src.wikidata.grid2ror rec.GridId ? rec.affiliation?.GridId
      res.push rec
      results.push rec
    return res

  if typeof q is 'string' and rel = await @src.microsoft.graph.relation q
    return _append rel
  
  count = 0
  if typeof q is 'string' and cn = @src.microsoft.graph.relation.count 'PaperId.exact:"' + q + '"'
    count += cn
    _append(@src.microsoft.graph.relation.fetch('PaperId.exact:"' + q + '"')) if cn < 10
  else if typeof q is 'string' and cn = @src.microsoft.graph.relation.count 'AuthorId.exact:"' + q + '"'
    count += cn
    _append(@src.microsoft.graph.relation.fetch('AuthorId.exact:"' + q + '"')) if cn < 10
  else if typeof q is 'string' and cn = @src.microsoft.graph.relation.count 'AffiliationId.exact:"' + q + '"'
    count += cn
    _append(@src.microsoft.graph.relation.fetch('AffiliationId.exact:"' + q + '"')) if cn < 10

  return results`;

P.src.oadoi = function(doi) {
  var ref, ref1, ref2, url;
  if (doi == null) {
    doi = (ref = this != null ? (ref1 = this.params) != null ? ref1.oadoi : void 0 : void 0) != null ? ref : this != null ? (ref2 = this.params) != null ? ref2.doi : void 0 : void 0;
  }
  if (typeof doi === 'string' && doi.startsWith('10.')) {
    url = 'https://api.oadoi.org/v2/' + doi + '?email=' + S.mail.to;
    return this.fetch(url);
  } else {
    return void 0;
  }
};


//P.src.oadoi._kv = false
P.src.oadoi._index = true;

P.src.oadoi._key = 'doi';

P.src.oadoi._prefix = false;

// pubmed API http://www.ncbi.nlm.nih.gov/books/NBK25497/
// examples http://www.ncbi.nlm.nih.gov/books/NBK25498/#chapter3.ESearch__ESummaryEFetch
// get a pmid - need first to issue a query to get some IDs...
// http://eutils.ncbi.nlm.nih.gov/entrez/eutils/epost.fcgi?id=21999661&db=pubmed
// then scrape the QueryKey and WebEnv values from it and use like so:
// http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&query_key=1&WebEnv=NCID_1_54953983_165.112.9.28_9001_1461227951_1012752855_0MetA0_S_MegaStore_F_1
P.src.pubmed = {};

P.src.pubmed.entrez = {};

P.src.pubmed.entrez.summary = async function(qk, webenv, id) {
  var frec, i, ii, j, k, len, len1, len2, md, rec, recs, ref1, ref2, ref3, res, si, sio, url;
  url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed';
  if (id != null) {
    if (_.isArray(id)) {
      id = id.join(',');
    }
    url += '&id=' + id; // can be a comma separated list as well
  } else {
    url += '&query_key=' + qk + '&WebEnv=' + webenv;
  }
  try {
    res = (await this.fetch(url));
    md = this.convert.xml2json(res.content);
    recs = [];
    ref1 = md.eSummaryResult.DocSum;
    for (i = 0, len = ref1.length; i < len; i++) {
      rec = ref1[i];
      frec = {
        id: rec.Id[0]
      };
      ref2 = rec.Item;
      for (j = 0, len1 = ref2.length; j < len1; j++) {
        ii = ref2[j];
        if (ii.$.Type === 'List') {
          frec[ii.$.Name] = [];
          if (ii.Item != null) {
            ref3 = ii.Item;
            for (k = 0, len2 = ref3.length; k < len2; k++) {
              si = ref3[k];
              sio = {};
              sio[si.$.Name] = si._;
              frec[ii.$.Name].push(sio);
            }
          }
        } else {
          frec[ii.$.Name] = ii._;
        }
      }
      recs.push(frec);
      if ((id == null) || id.indexOf(',') === -1) {
        return recs[0];
        break;
      }
    }
    return recs;
  } catch (error) {
    return void 0;
  }
};

P.src.pubmed.entrez.pmid = async function(pmid) {
  var res, result, url;
  url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/epost.fcgi?db=pubmed&id=' + pmid;
  try {
    res = (await this.fetch(url));
    result = this.convert.xml2json(res.content);
    return this.src.pubmed.entrez.summary(result.ePostResult.QueryKey[0], result.ePostResult.WebEnv[0]);
  } catch (error) {
    return void 0;
  }
};

P.src.pubmed.search = async function(str, full, size = 10, ids = false) {
  var i, id, j, k, l, len, len1, len2, len3, pg, rec, ref1, ref2, res, result, uid, url, urlids;
  url = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmax=' + size + '&sort=pub date&term=' + str;
  try {
    if (typeof ids === 'string') {
      ids = ids.split(',');
    }
    if (Array.isArray(ids)) {
      res = {
        total: ids.length,
        data: []
      };
    } else {
      res = (await this.fetch(url));
      result = this.convert.xml2json(res.content);
      res = {
        total: result.eSearchResult.Count[0],
        data: []
      };
      if (ids === true) {
        res.data = result.eSearchResult.IdList[0].Id;
        return res;
      } else {
        ids = result.eSearchResult.IdList[0].Id;
      }
    }
    if (full) { // may need a rate limiter on this
      for (i = 0, len = ids.length; i < len; i++) {
        uid = ids[i];
        pg = (await this.src.pubmed.pmid(uid)); // should rate limit this to 300ms
        res.data.push(pg);
        if (res.data.length === size) {
          break;
        }
      }
    } else {
      urlids = [];
      for (j = 0, len1 = ids.length; j < len1; j++) {
        id = ids[j];
        if (res.data.length === size) {
          break;
        }
        urlids.push(id);
        if (urlids.length === 40) {
          ref1 = (await this.src.pubmed.entrez.summary(void 0, void 0, urlids));
          for (k = 0, len2 = ref1.length; k < len2; k++) {
            rec = ref1[k];
            res.data.push((await this.src.pubmed.format(rec)));
            if (res.data.length === size) {
              break;
            }
          }
          urlids = [];
        }
      }
      if (urlids.length) {
        ref2 = this.src.pubmed.entrez.summary(void 0, void 0, urlids);
        for (l = 0, len3 = ref2.length; l < len3; l++) {
          rec = ref2[l];
          res.data.push(this.src.pubmed.format(rec));
          if (res.data.length === size) {
            break;
          }
        }
      }
    }
    return res;
  } catch (error) {
    return void 0;
  }
};

P.src.pubmed.pmid = async function(pmid) {
  var res, url;
  try {
    url = 'https://www.ncbi.nlm.nih.gov/pubmed/' + pmid + '?report=xml';
    res = (await this.fetch(url));
    if (res.indexOf('<') === 0) {
      return this.src.pubmed.format((await this.decode(res.content.split('<pre>')[1].split('</pre>')[0].replace('\n', ''))));
    }
  } catch (error) {}
  try {
    return this.src.pubmed.format((await this.src.pubmed.entrez.pmid(pmid)));
  } catch (error) {}
  return void 0;
};

P.src.pubmed.aheadofprint = async function(pmid) {
  var res;
  try {
    res = (await this.fetch('https://www.ncbi.nlm.nih.gov/pubmed/' + pmid + '?report=xml'));
    return res.indexOf('PublicationStatus&gt;aheadofprint&lt;/PublicationStatus') !== -1;
  } catch (error) {
    return false;
  }
};

P.src.pubmed.format = function(rec, metadata = {}) {
  var a, ai, an, ar, frec, i, ii, j, k, l, len, len1, len2, len3, len4, len5, len6, len7, m, mc, n, o, p, pd, pid, q, rc, ref, ref1, ref10, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, rf, si, sio;
  if (typeof rec === 'string' && rec.indexOf('<') === 0) {
    rec = this.convert.xml2json(rec);
  }
  if ((((ref1 = rec.eSummaryResult) != null ? ref1.DocSum : void 0) != null) || rec.ArticleIds) {
    frec = {};
    if (((ref2 = rec.eSummaryResult) != null ? ref2.DocSum : void 0) != null) {
      rec = md.eSummaryResult.DocSum[0];
      ref3 = rec.Item;
      for (i = 0, len = ref3.length; i < len; i++) {
        ii = ref3[i];
        if (ii.$.Type === 'List') {
          frec[ii.$.Name] = [];
          if (ii.Item != null) {
            ref4 = ii.Item;
            for (j = 0, len1 = ref4.length; j < len1; j++) {
              si = ref4[j];
              sio = {};
              sio[si.$.Name] = si._;
              frec[ii.$.Name].push(sio);
            }
          }
        } else {
          frec[ii.$.Name] = ii._;
        }
      }
    } else {
      frec = rec;
    }
    try {
      if (metadata.pmid == null) {
        metadata.pmid = rec.Id[0];
      }
    } catch (error) {}
    try {
      if (metadata.pmid == null) {
        metadata.pmid = rec.id;
      }
    } catch (error) {}
    try {
      if (metadata.title == null) {
        metadata.title = frec.Title;
      }
    } catch (error) {}
    try {
      if (metadata.issn == null) {
        metadata.issn = frec.ISSN;
      }
    } catch (error) {}
    try {
      if (metadata.essn == null) {
        metadata.essn = frec.ESSN;
      }
    } catch (error) {}
    try {
      if (metadata.doi == null) {
        metadata.doi = frec.DOI;
      }
    } catch (error) {}
    try {
      if (metadata.journal == null) {
        metadata.journal = frec.FullJournalName;
      }
    } catch (error) {}
    try {
      if (metadata.journal_short == null) {
        metadata.journal_short = frec.Source;
      }
    } catch (error) {}
    try {
      if (metadata.volume == null) {
        metadata.volume = frec.Volume;
      }
    } catch (error) {}
    try {
      if (metadata.issue == null) {
        metadata.issue = frec.Issue;
      }
    } catch (error) {}
    try {
      if (metadata.page == null) {
        metadata.page = frec.Pages; //like 13-29 how to handle this
      }
    } catch (error) {}
    try {
      if (metadata.year == null) {
        metadata.year = frec[frec.PubDate ? 'PubDate' : 'EPubDate'].split(' ')[0];
      }
    } catch (error) {}
    try {
      p = frec[frec.PubDate ? 'PubDate' : 'EPubDate'].split(' ');
      if (metadata.published == null) {
        metadata.published = p[0] + '-' + (['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(p[1].toLowerCase()) + 1) + '-' + (p.length === 3 ? p[2] : '01');
      }
    } catch (error) {}
    if (frec.AuthorList != null) {
      if (metadata.author == null) {
        metadata.author = [];
      }
      ref5 = frec.AuthorList;
      for (k = 0, len2 = ref5.length; k < len2; k++) {
        a = ref5[k];
        try {
          a.family = a.Author.split(' ')[0];
          a.given = a.Author.replace(a.family + ' ', '');
          a.name = a.given + ' ' + a.family;
          metadata.author.push(a);
        } catch (error) {}
      }
    }
    if ((frec.ArticleIds != null) && (metadata.pmcid == null)) {
      ref6 = frec.ArticleIds;
      for (l = 0, len3 = ref6.length; l < len3; l++) {
        ai = ref6[l];
        if (ai.pmc) { // pmcid or pmc? replace PMC in the value? it will be present
          if (metadata.pmcid == null) {
            metadata.pmcid = ai.pmc;
          }
          break;
        }
      }
    }
  } else if (rec.PubmedArticle != null) {
    rec = rec.PubmedArticle;
    mc = rec.MedlineCitation[0];
    try {
      if (metadata.pmid == null) {
        metadata.pmid = mc.PMID[0]._;
      }
    } catch (error) {}
    try {
      if (metadata.title == null) {
        metadata.title = mc.Article[0].ArticleTitle[0];
      }
    } catch (error) {}
    try {
      if (metadata.issn == null) {
        metadata.issn = mc.Article[0].Journal[0].ISSN[0]._;
      }
    } catch (error) {}
    try {
      if (metadata.journal == null) {
        metadata.journal = mc.Article[0].Journal[0].Title[0];
      }
    } catch (error) {}
    try {
      if (metadata.journal_short == null) {
        metadata.journal_short = mc.Article[0].Journal[0].ISOAbbreviation[0];
      }
    } catch (error) {}
    try {
      pd = mc.Article[0].Journal[0].JournalIssue[0].PubDate[0];
      try {
        if (metadata.year == null) {
          metadata.year = pd.Year[0];
        }
      } catch (error) {}
      try {
        if (metadata.published == null) {
          metadata.published = pd.Year[0] + '-' + (pd.Month ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(pd.Month[0].toLowerCase()) + 1 : '01') + '-' + (pd.Day ? pd.Day[0] : '01');
        }
      } catch (error) {}
    } catch (error) {}
    try {
      if (metadata.author == null) {
        metadata.author = [];
      }
      ref7 = mc.Article[0].AuthorList[0].Author;
      for (m = 0, len4 = ref7.length; m < len4; m++) {
        ar = ref7[m];
        a = {};
        a.family = ar.LastName[0];
        a.given = ar.ForeName[0];
        a.name = a.Author ? a.Author : a.given + ' ' + a.family;
        try {
          a.affiliation = ar.AffiliationInfo[0].Affiliation[0];
        } catch (error) {}
        if (a.affiliation != null) {
          if (_.isArray(a.affiliation)) {
            a.affiliation = a.affiliation[0];
          }
          if (typeof a.affiliation === 'string') {
            a.affiliation = {
              name: a.affiliation
            };
          }
        }
        metadata.author.push(a);
      }
    } catch (error) {}
    try {
      ref8 = rec.PubmedData[0].ArticleIdList[0].ArticleId;
      for (n = 0, len5 = ref8.length; n < len5; n++) {
        pid = ref8[n];
        if (pid.$.IdType === 'doi') {
          if (metadata.doi == null) {
            metadata.doi = pid._;
          }
          break;
        }
      }
    } catch (error) {}
    try {
      if (metadata.reference == null) {
        metadata.reference = [];
      }
      ref9 = rec.PubmedData[0].ReferenceList[0].Reference;
      for (o = 0, len6 = ref9.length; o < len6; o++) {
        ref = ref9[o];
        rc = ref.Citation[0];
        rf = {};
        if (rc.indexOf('doi.org/') !== -1) {
          rf.doi = rc.split('doi.org/')[1].trim();
        }
        try {
          rf.author = [];
          ref10 = rc.split('. ')[0].split(', ');
          for (q = 0, len7 = ref10.length; q < len7; q++) {
            an = ref10[q];
            rf.author.push({
              name: an
            });
          }
        } catch (error) {}
        try {
          rf.title = rc.split('. ')[1].split('?')[0].trim();
        } catch (error) {}
        try {
          rf.journal = rc.replace(/\?/g, '.').split('. ')[2].trim();
        } catch (error) {}
        try {
          rf.url = 'http' + rc.split('http')[1].split(' ')[0];
          if (rf.url.indexOf('doi.org') !== -1) {
            delete rf.url;
          }
        } catch (error) {}
        if (!_.isEmpty(rf)) {
          metadata.reference.push(rf);
        }
      }
    } catch (error) {}
  }
  try {
    if (metadata.pdf == null) {
      metadata.pdf = rec.pdf;
    }
  } catch (error) {}
  try {
    if (metadata.url == null) {
      metadata.url = rec.url;
    }
  } catch (error) {}
  try {
    if (metadata.open == null) {
      metadata.open = rec.open;
    }
  } catch (error) {}
  try {
    if (metadata.redirect == null) {
      metadata.redirect = rec.redirect;
    }
  } catch (error) {}
  return metadata;
};

try {
  S.svc.sherpa = JSON.parse(SECRETS_SHERPA);
} catch (error) {}

P.src.sherpa = {};

P.src.sherpa.opendoar = {
  _index: true,
  _prefix: false
};

// https://v2.sherpa.ac.uk/api/object-retrieval.html
P.src.sherpa.opendoar.import = async function() {
  var counter, i, len, offset, rec, recs, ref, res;
  this.src.sherpa.opendoar('');
  recs = [];
  counter = 0;
  offset = 0;
  while (res = (await this.fetch('https://v2.sherpa.ac.uk/cgi/retrieve?api-key=' + this.S.svc.sherpa.apikey + '&item-type=repository&format=Json&offset=' + offset))) {
    if (((typeof res !== "undefined" && res !== null ? res.items : void 0) == null) || !res.items.length) {
      break;
    }
    console.log(offset, counter, res.items.length);
    offset += 100; // opendoar returns 100 at a time by default, and that is also the max
    ref = res.items;
    for (i = 0, len = ref.length; i < len; i++) {
      rec = ref[i];
      counter += 1;
      recs.push(rec);
      if (recs.length === 2000) {
        await this.src.sherpa.opendoar(recs);
        recs = [];
      }
    }
  }
  if (recs.length) {
    await this.src.sherpa.opendoar(recs);
  }
  return counter;
};

P.src.sherpa.opendoar.import._hidden = true;

// TODO copy over from old system
P.src.wikidata = function(q) {
  var ref, ref1;
  try {
    if (q == null) {
      q = (ref = (ref1 = this.params.wikidata) != null ? ref1 : this.params.q) != null ? ref : this.params;
    }
  } catch (error) {}
  if (typeof q === 'string') {
    if (q.indexOf('Q') === 0) {
      return this.fetch('https://dev.api.cottagelabs.com/use/wikidata/' + q);
    } else {
      return this.fetch('https://dev.api.cottagelabs.com/use/wikidata?q=' + q);
    }
  } else {
    return this.fetch('https://dev.api.cottagelabs.com/use/wikidata', {
      body: q
    });
  }
};

// http://zenodo.org/dev
// https://zenodo.org/api/deposit/depositions
// api key required: http://zenodo.org/dev#restapi-auth
// requires a token be provided as query param on all requests, called ?access_token=

// access token would require deposit:write and deposit:actions permission in order to deposit something AND then publish it

// need to POST create a deposition, then POST upload files to the deposition, then POST publish the deposition
P.src.zenodo = {
  deposition: {},
  records: {}
};

// zenodo can now be searched, technically in test, at zenodo.org/api/records
// see search page for instructions (it is ES) https://help.zenodo.org/guides/search/
P.src.zenodo.records.search = function(q, dev) {
  var url;
  // it does have sort but does not seem to parse direction yet, so not much use sorting on publication_date
  // does not seem to do paging or cursors yet either - but size works
  if (q == null) {
    q = this.params;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  url = 'https://' + (this.S.dev || dev ? 'sandbox.' : '') + 'zenodo.org/api/records?size=' + size + '&q=' + q; // just do simple string queries for now
  return this.fetch(url); // could do a post if q is more complex... so far this just returns an ES search endpoint
};

P.src.zenodo.records.record = function(zid, dev) {
  var ref;
  if (zid == null) {
    zid = (ref = this.params.record) != null ? ref : this.params.id;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  return this.fetch('https://' + (this.S.dev || dev ? 'sandbox.' : '') + 'zenodo.org/api/records/' + zid);
};

P.src.zenodo.records.get = async function(q, dev) {
  var r;
  if (q == null) {
    q = this.params.get;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  r = (await this.src.zenodo.records.search(q, dev));
  try {
    return r.hits.hits[0];
  } catch (error) {
    return void 0;
  }
};

P.src.zenodo.records.doi = function(doi, dev) {
  if (doi == null) {
    doi = this.params.doi;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  return this.src.zenodo.records.get('doi:"' + doi + '"', dev);
};

P.src.zenodo.records.title = function(title, dev) {
  if (title == null) {
    title = this.params.title;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  return this.src.zenodo.records.get('title:"' + title + '"', dev);
};

P.src.zenodo.records.format = async function(rec) {
  var a, as, f, i, j, len, len1, metadata, ref, ref1, ref2;
  if (rec == null) {
    rec = this.params;
  }
  metadata = {};
  try {
    if (metadata.pdf == null) {
      metadata.pdf = rec.pdf;
    }
  } catch (error) {}
  try {
    if (metadata.url == null) {
      metadata.url = rec.url;
    }
  } catch (error) {}
  if (metadata.doi == null) {
    metadata.doi = rec.doi;
  }
  try {
    if (typeof rec.metadata.publication_date === 'string' && rec.metadata.publication_date.split('-').length === 3) {
      metadata.published = rec.metadata.publication_date;
      try {
        metadata.year = metadata.published.split('-')[0];
      } catch (error) {}
    }
  } catch (error) {}
  try {
    if (metadata.title == null) {
      metadata.title = rec.metadata.title;
    }
  } catch (error) {}
  try {
    if (metadata.journal == null) {
      metadata.journal = rec.metadata.journal.title;
    }
  } catch (error) {}
  try {
    if (metadata.issue == null) {
      metadata.issue = rec.metadata.journal.issue;
    }
  } catch (error) {}
  try {
    if (metadata.page == null) {
      metadata.page = rec.metadata.journal.pages;
    }
  } catch (error) {}
  try {
    if (metadata.volume == null) {
      metadata.volume = rec.metadata.journal.volume;
    }
  } catch (error) {}
  try {
    if (metadata.keyword == null) {
      metadata.keyword = rec.metadata.keywords;
    }
  } catch (error) {}
  try {
    if (metadata.licence == null) {
      metadata.licence = rec.metadata.license.id;
    }
  } catch (error) {}
  try {
    metadata.abstract = (await this.convert.html2txt(rec.metadata.description));
  } catch (error) {}
  try {
    if (rec.metadata.access_right = "open") {
      if (metadata.url == null) {
        metadata.url = (rec.files != null) && rec.files.length && (((ref = rec.files[0].links) != null ? ref.self : void 0) != null) ? rec.files[0].links.self : rec.links.html;
      }
      if (metadata.open == null) {
        metadata.open = metadata.url;
      }
    }
  } catch (error) {}
  try {
    ref1 = rec.files;
    for (i = 0, len = ref1.length; i < len; i++) {
      f = ref1[i];
      if (f.type === 'pdf') {
        if (metadata.pdf == null) {
          metadata.pdf = f.links.self;
        }
        break;
      }
    }
  } catch (error) {}
  try {
    if (metadata.author == null) {
      metadata.author = [];
    }
    ref2 = rec.metadata.creators;
    for (j = 0, len1 = ref2.length; j < len1; j++) {
      a = ref2[j];
      if (typeof a === 'string') {
        a = {
          name: a
        };
      }
      if ((a.name != null) && a.name.toLowerCase() !== 'unknown') {
        as = a.name.split(' ');
        try {
          a.family = as[as.length - 1];
        } catch (error) {}
        try {
          a.given = a.name.replace(a.family, '').trim();
        } catch (error) {}
      }
      if (a.affiliation != null) {
        if (_.isArray(a.affiliation)) {
          a.affiliation = a.affiliation[0];
        }
        if (typeof a.affiliation === 'string') {
          a.affiliation = {
            name: a.affiliation
          };
        }
      }
      metadata.author.push(a);
    }
  } catch (error) {}
  return metadata;
};

P.src.zenodo.deposition.create = async function(metadata, up, token, dev) {
  var base, data, ref, ref1, ref2, ref3, rs, url;
  // https://zenodo.org/dev#restapi-rep-meta
  if (dev == null) {
    dev = this.params.dev;
  }
  if (token == null) {
    token = this.params.token;
  }
  if (token == null) {
    token = this.S.dev || dev ? (ref = this.S.src) != null ? (ref1 = ref.zenodo) != null ? ref1.sandbox : void 0 : void 0 : (ref2 = this.S.src) != null ? (ref3 = ref2.zenodo) != null ? ref3.token : void 0 : void 0;
  }
  if (metadata == null) {
    metadata = this.params.metadata; // or try to retrieve from oaworks.metadata?
  }
  if ((token == null) || (metadata == null) || (metadata.title == null) || (metadata.description == null)) {
    return false;
  }
  url = 'https://' + (this.S.dev || dev ? 'sandbox.' : '') + 'zenodo.org/api/deposit/depositions?access_token=' + token;
  data = {
    metadata: metadata
  };
  if (!data.metadata.upload_type) {
    data.metadata.upload_type = 'publication';
    data.metadata.publication_type = 'article';
  }
  // required field, will blank list work? If not, need object with name: Surname, name(s) and optional affiliation and creator
  if ((base = data.metadata).creators == null) {
    base.creators = [
      {
        name: "Works, Open Access"
      }
    ];
  }
  if (up != null) {
    rs = (await this.fetch(url, {
      method: 'POST',
      body: data
    }));
    if (((rs != null ? rs.id : void 0) != null) && (up.content || up.file)) {
      rs.uploaded = (await this.src.zenodo.deposition.upload(rs.id, up.content, up.file, up.name, up.url, token));
    }
    if (up.publish) {
      rs.published = (await this.src.zenodo.deposition.publish(rs.id, token));
    }
    return rs;
  } else {
    // returns a zenodo deposition resource, which most usefully has an .id parameter (to use to then upload files to)
    return (await this.fetch(url, {
      method: 'POST',
      body: data
    }));
  }
};

P.src.zenodo.deposition.upload = async function(id, content, file, name, url, token, dev) {
  var ref, ref1, ref2, ref3;
  if (id == null) {
    id = (ref = this.params.upload) != null ? ref : this.params.id;
  }
  if (content == null) {
    content = this.params.content;
  }
  if (name == null) {
    name = this.params.name;
  }
  if (!content && !file) {
    try {
      file = this.request.files[0];
    } catch (error) {}
  }
  if (url && !content && !file) {
    try {
      content = (await this.fetch(url));
    } catch (error) {}
  }
  if (token == null) {
    token = this.params.token;
  }
  if (token == null) {
    token = this.S.dev || dev ? (ref1 = this.S.src.zenodo) != null ? ref1.sandbox : void 0 : (ref2 = this.S.src) != null ? (ref3 = ref2.zenodo) != null ? ref3.token : void 0 : void 0;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  if ((token == null) || (id == null)) {
    return false;
  }
  url = 'https://' + (this.S.dev || dev ? 'sandbox.' : '') + 'zenodo.org/api/deposit/depositions/' + id + '/files?access_token=' + token;
  return this.fetch(url, {
    method: 'POST',
    body: content != null ? content : file
  }, {
    name: name // TODO how to send file and params such as name - make fetch do multipart
  });
};

// NOTE this should not only be run on backend, it should be contacted directly on backend via a DNS pass-through at cloudflare
// because cloudflare will limit the size of files getting POSTed through. Or whatever method calls this one should be directly contacted on backend
P.src.zenodo.deposition.publish = function(id, token, dev) {
  var ref, ref1, ref2, ref3, url;
  // NOTE published things cannot be deteted
  if (id == null) {
    id = (ref = this.params.publish) != null ? ref : this.params.id;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  if (token == null) {
    token = this.params.token;
  }
  if (token == null) {
    token = this.S.dev || dev ? (ref1 = this.S.src.zenodo) != null ? ref1.sandbox : void 0 : (ref2 = this.S.src) != null ? (ref3 = ref2.zenodo) != null ? ref3.token : void 0 : void 0;
  }
  if ((token == null) || (id == null)) {
    return false;
  }
  url = 'https://' + (this.S.dev || dev ? 'sandbox.' : '') + 'zenodo.org/api/deposit/depositions/' + id + '/actions/publish?access_token=' + token;
  return this.fetch(url, {
    method: 'POST'
  });
};

P.src.zenodo.deposition.delete = async function(id, token, dev) {
  var ref, ref1, ref2, url;
  if (id == null) {
    id = (ref = this.params.publish) != null ? ref : this.params.id;
  }
  if (dev == null) {
    dev = this.params.dev;
  }
  if (token == null) {
    token = this.params.token;
  }
  if (token == null) {
    token = this.S.dev || dev ? (ref1 = this.S.src.zenodo) != null ? ref1.sandbox : void 0 : (ref2 = this.S.src.zenodo) != null ? ref2.token : void 0;
  }
  if ((token == null) || (id == null)) {
    return false;
  }
  url = 'https://' + (this.S.dev || dev ? 'sandbox.' : '') + 'zenodo.org/api/deposit/depositions/' + id + '?access_token=' + token;
  await this.fetch(url, {
    method: 'DELETE'
  });
  return true;
};

`P.svc.lantern = (jid) ->
  jid ?= @params.lantern ? @params.job
  jid = undefined if jid and jid.startsWith '10.'
  if jid?
    job = await @svc.lantern.job jid
    job.progress = await @svc.lantern.progress job
    return job
  else
    if @params.doi or @params.lantern or @params.pmid or @params.pmc or @params.pmcid or @body
      job = {}
      job.email ?= @params.email
      job._id = @uid()
      if @body
        if typeof @body is 'object' and not Array.isArray(@body) and @body.list
          job.processes = @body.list
          job.name ?= @body.name
        else
          job.processes = @body
      else
        job.processes = []
        job.processes.push({doi: @params.doi ? @params.lantern}) if @params.doi or @params.lantern
        job.processes.push({pmid: @params.pmid}) if @params.pmid
        job.processes.push({pmcid: @params.pmcid ? @params.pmc}) if @params.pmcid or @params.pmc
        job.name ?= @params.name

      @svc.lantern.job job
      for i of job.processes
        @svc.lantern.process job.processes[i], if parseInt(i) is job.processes.length - 1 then job else undefined
      if job.email
        text = 'Dear ' + job.email + '\n\nWe\'ve just started processing a batch of identifiers for you, and you can see the progress of the job here:\n\n'
        text += 'https://compliance.cottagelabs.com#' + job._id
        text += '\n\nIf you didn\'t submit this request yourself, it probably means that another service is running '
        text += 'it on your behalf, so this is just to keep you informed about what\'s happening with your account; '
        text += 'you don\'t need to do anything else.\n\nYou\'ll get another email when your job has completed.\n\n'
        @mail
          from: 'Lantern <lantern@cottagelabs.com>'
          to: job.email
          subject: 'Wellcome Compliance: job ' + (job.name ? job._id) + ' submitted successfully'
          text: text
      return job
    else
      return
        name: 'Lantern for Wellcome'
        version: @S.version
        base: if @S.dev then @base else undefined
        built: @S.built

P.svc.lantern.job = _index: true
P.svc.lantern.result = _index: true

P.svc.lantern.results = (jid, count) ->
  jid ?= @params.lantern ? @params.results ? @params.job
  job = await @svc.lantern.job jid
  jr = if count then 0 else []
  for proc in job.processes
    if res = await @svc.lantern.result proc._id
      if count
        jr += 1
      else
        jr.push res
  if @format isnt 'csv'
    return jr
  else
    fields = ["pmcid", "pmid", "doi", "title", "journal_title", "pure_oa", "issn", "eissn", "publication_date",
      "electronic_publication_date", "publisher", "publisher_licence", "licence", "epmc_licence", "licence_source",
      "epmc_licence_source", "in_epmc", "epmc_xml", "aam", "open_access", "ahead_of_print", "romeo_colour", "preprint_embargo",
      "preprint_self_archiving", "postprint_embargo", "postprint_self_archiving", "publisher_copy_embargo", "publisher_copy_self_archiving",
      "authors", "in_core", "in_base", "repositories", "repository_urls", "repository_oai_ids", "repository_fulltext_urls", "confidence",
      "compliance_wellcome_standard", "compliance_wellcome_deluxe"
    ]
    grantcount = 0
    fieldconfig = []
    results = []
    for res in job
      result = {}
      for fname in fields
        printname = P.svc.lantern._fields[fname]?.short_name ? fname
        fieldconfig.push(printname) if printname not in fieldconfig
        if fname is 'authors'
          result[printname] = ''
          for r of res.authors
            result[printname] += if r is '0' then '' else '\r\n'
            result[printname] += res.authors[r].fullName if res.authors[r].fullName
        else if fname in ['repositories','repository_urls','repository_fulltext_urls','repository_oai_ids']
          result[printname] = ''
          if res.repositories?
            for rr in res.repositories
              if rr.name
                result[printname] += '\r\n' if result[printname]
                if fname is 'repositories'
                  result[printname] += rr.name ? ''
                else if fname is 'repository_urls'
                  result[printname] += rr.url ? ''
                else if fname is 'repository_fulltext_urls'
                  result[printname] += if rr.fulltexts? then rr.fulltexts.join() else ''
                else if fname is 'repository_oai_ids'
                  result[printname] += rr.oai ? ''
        else if fname is 'pmcid' and res.pmcid
          res.pmcid = 'PMC' + res.pmcid if res.pmcid.toLowerCase().indexOf('pmc') isnt 0
          result[printname] = res.pmcid
        else if res[fname] is true
          result[printname] = 'TRUE'
        else if res[fname] is false
          result[printname] = 'FALSE'
        else if not res[fname]? or res[fname] is 'unknown'
          result[printname] = 'Unknown'
        else
          result[printname] = res[fname]
      if res.grants?
        rgc = 0
        for grnt in res.grants
          rgc += 1
          result[(P.svc.lantern._fields.grant?.short_name ? 'grant').split(' ')[0] + ' ' + rgc] = grnt.grantId ? ''
          result[(P.svc.lantern._fields.agency?.short_name ? 'agency').split(' ')[0] + ' ' + rgc] = grnt.agency ? ''
          result[(P.svc.lantern._fields.pi?.short_name ? 'pi').split(' ')[0] + ' ' + rgc] = grnt.PI ? (if grnt.grantId or grnt.agency then 'Unknown' else '')
        grantcount = rgc if rgc > grantcount
      tpn = P.svc.lantern._fields['provenance']?.short_name ? 'provenance'
      result[tpn] = ''
      if res.provenance?
        for pr of res.provenance
          result[tpn] += if pr is '0' then '' else '\r\n'
          result[tpn] += res.provenance[pr]
      results.push result
    gc = 1
    while gc < grantcount+1
      fieldconfig.push (P.svc.lantern._fields.grant?.short_name ? 'grant').split(' ')[0] + ' ' + gc
      fieldconfig.push (P.svc.lantern._fields.agency?.short_name ? 'agency').split(' ')[0] + ' ' + gc
      fieldconfig.push (P.svc.lantern._fields.pi?.short_name ? 'pi').split(' ')[0] + ' ' + gc
      gc++
    fieldconfig.push(P.svc.lantern._fields.provenance?.short_name ? 'provenance') if 'provenance' not in ignorefields
    return @convert.json2csv results

P.svc.lantern.progress = (jid) ->
  jid ?= @params.lantern ? @params.progress ? @params.job
  job = if typeof jid is 'object' then jid else await @svc.lantern jid
  progress = await @svc.lantern.results job, true
  # TODO calculate the progress of the job somehow
  return Math.ceil((progress/job.processes.length)*10000)/100

P.svc.lantern.licence = (url, content, start, end) ->
  url ?= @params.url
  url = url.replace(/(^\s*)|(\s*$)/g,'') if url?
  content ?= @params.content ? @body
  try content ?= await @puppet url
  content = undefined if typeof content is 'number'
  start ?= @params.start
  end ?= @params.end

  lic = {}
  lic.url = url if url
  if typeof content is 'string'
    content = content.split(start)[1] if start? and content.indexOf(start) isnt -1
    content = content.split(end)[0] if end?
    if content.length > 1000000
      lic.large = true
      content = content.substring(0,500000) + content.substring(content.length-500000, content.length)

    lics = await @svc.lantern.licences '*', 100000
    for lh in lics?.hits?.hits ? []
      l = lh._source
      if  not l.matchesondomains or l.matchesondomains is '*' or not url? or l.matchesondomains.toLowerCase().indexOf(url.toLowerCase().replace('http://','').replace('https://','').replace('www.','').split('/')[0]) isnt -1
        match = l.matchtext.toLowerCase().replace(/[^a-z0-9]/g, '')
        urlmatcher = if l.matchtext.indexOf('://') isnt -1 then l.matchtext.toLowerCase().split('://')[1].split('"')[0].split(' ')[0] else false
        urlmatch = if urlmatcher then content.toLowerCase().indexOf(urlmatcher) isnt -1 else false
        if urlmatch or content.toLowerCase().replace(/[^a-z0-9]/g,'').indexOf(match) isnt -1
          lic.licence = l.licencetype
          lic.match = l.matchtext
          lic.matched = if urlmatch then urlmatcher else match
          break
  return lic

P.svc.lantern.licences = _sheet: '1yJOpE_YMdDxCKaK0DqWoCJDdq8Ep1b-_J1xYVKGsiYI', _prefix: false


P.svc.lantern.process = (proc, last) ->
  _formatepmcdate = (date) ->
    try
      date = date.replace(/\//g,'-')
      if date.indexOf('-') isnt -1
        if date.length < 11
          dp = date.split '-'
          if dp.length is 3
            if date.indexOf('-') < 4
              return dp[2] + '-' + dp[1] + '-' + dp[0] + 'T00:00:00Z'
            else
              return date + 'T00:00:00Z'
          else if dp.length is 2
            if date.indexOf('-') < 4
              return dp[1] + dp[0] + date + '-01T00:00:00Z'
            else
              return date + '-01T00:00:00Z'
        return date
      else
        dateparts = date.replace(/  /g,' ').split(' ')
        yr = dateparts[0].toString()
        mth = if dateparts.length > 1 then dateparts[1] else 1
        if isNaN(parseInt(mth))
          mths = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
          tmth = mth.toLowerCase().substring(0,3)
          mth = if mths.indexOf(tmth) isnt -1 then mths.indexOf(tmth) + 1 else "01"
        else
          mth = parseInt mth
        mth = mth.toString()
        mth = "0" + mth if mth.length is 1
        dy = if dateparts.length > 2 then dateparts[2].toString() else "01"
        dy = "0" + dy if dy.length is 1
        return yr + '-' + mth + '-' + dy + 'T00:00:00Z'
    catch
      return undefined

  proc ?= doi: @params.doi, pmid: @params.pmid, pmcid: @params.pmcid
  for pu in ['DOI', 'PMID', 'PMCID', 'TITLE']
    proc[pu.toLowerCase()] = proc[pu] if proc[pu]
  proc.doi ?= proc.DOI
  proc.pmid ?= proc.PMID
  proc.pmcid ?= proc.PMCID ? proc.PMC ? proc.pmc
  proc.title ?= proc['article title'] ? proc['Article title'] ? proc['Article Title']
  proc.title = proc.title.replace(/\s\s+/g,' ').trim() if proc.title
  proc.pmcid = proc.pmcid.replace(/[^0-9]/g,'') if proc.pmcid
  proc.pmid = proc.pmid.replace(/[^0-9]/g,'') if proc.pmid
  proc.doi = decodeURIComponent(proc.doi.replace(/ /g,'')) if proc.doi
  proc._id ?= if proc.doi then proc.doi.replace(/\//g, '_') else (proc.pmcid ? proc.pmid ? await @uid())

  result =
    _id: proc._id
    pmcid: proc.pmcid
    pmid: proc.pmid
    doi: proc.doi
    title: proc.title
    journal_title: undefined
    pure_oa: false # set to true if found in doaj
    issn: undefined
    eissn: undefined
    publication_date: undefined
    electronic_publication_date: undefined
    publisher: undefined
    publisher_licence: undefined
    licence: 'unknown' # what sort of licence this has - should be a string like "cc-by"
    epmc_licence: 'unknown' # the licence in EPMC, should be a string like "cc-by"
    licence_source: 'unknown' # where the licence info came from
    epmc_licence_source: 'unknown' # where the EPMC licence info came from (fulltext xml, EPMC splash page, etc.)
    in_epmc: false # set to true if found
    epmc_xml: false # set to true if oa and in epmc and can retrieve fulltext xml from eupmc rest API url
    aam: false # set to true if is an eupmc author manuscript
    open_access: false # set to true if eupmc or other source says is oa
    ahead_of_print: undefined # if pubmed returns a date for this, it will be a date
    preprint_embargo: 'unknown'
    preprint_self_archiving: 'unknown'
    postprint_embargo: 'unknown'
    postprint_self_archiving: 'unknown'
    publisher_copy_embargo: 'unknown'
    publisher_copy_self_archiving: 'unknown'
    authors: [] # eupmc author list if available
    in_core: 'unknown'
    in_base: 'unknown'
    repositories: [] # where CORE or BASE says it is. Should be list of objects
    grants:[] # a list of grants, probably from eupmc for now
    confidence: 0 # 1 if matched on ID, 0.9 if title to 1 result, 0.7 if title to multiple results, 0 if unknown article
    provenance: []

  # search eupmc by (in order) pmcid, pmid, doi, title
  for st in ['pmcid','pmid','doi','title']
    if proc[st]
      if res = await @src.epmc[if st is 'pmcid' then 'pmc' else st] proc[st]
        eupmc = res
        result.confidence = if st isnt 'title' then 1 else if res.title.toLowerCase() is proc[st].toLowerCase() then 1 else 0.9
        break
      else if st is 'title' and res = await @src.epmc 'title:' + proc[st]
        if res?.data? and res.data.length
          eupmc = res.data[0]
          result.confidence = 0.7

  if eupmc?
    if eupmc.pmcid and result.pmcid isnt eupmc.pmcid
      result.pmcid = eupmc.pmcid
      result.provenance.push 'Added PMCID from EUPMC'
    if eupmc.pmid and result.pmid isnt eupmc.pmid
      result.pmid = eupmc.pmid
      result.provenance.push 'Added PMID from EUPMC'
    if eupmc.doi and result.doi isnt eupmc.doi
      result.doi = eupmc.doi
      result.provenance.push 'Added DOI from EUPMC'
    if eupmc.title and not result.title
      result.title = eupmc.title
      result.provenance.push 'Added article title from EUPMC'
    if eupmc.inEPMC is 'Y'
      result.in_epmc = true
      result.provenance.push 'Confirmed fulltext is in EUPMC'
    if eupmc.isOpenAccess is 'Y'
      result.open_access = true
      result.provenance.push 'Confirmed is open access from EUPMC'
    else
      result.provenance.push 'This article is not open access according to EUPMC, but since 6th March 2020 we take this to mean only that the publisher did not indicate to EUPMC that it can be included in their Open Access subset - it may well still be an OA article.'
    if eupmc.journalInfo?.journal
      if eupmc.journalInfo.journal.title
        result.journal_title = eupmc.journalInfo.journal.title
        result.provenance.push 'Added journal title from EUPMC'
      if eupmc.journalInfo.journal.issn
        result.issn = eupmc.journalInfo.journal.issn
        result.provenance.push 'Added issn from EUPMC'
      if eupmc.journalInfo.journal.essn
        result.eissn = eupmc.journalInfo.journal.essn
        if result.eissn and ( not result.issn or result.issn.indexOf(result.eissn) is -1 )
          result.issn = (if result.issn then result.issn + ', ' else '') + result.eissn
        result.provenance.push 'Added eissn from EUPMC'
    if eupmc.grantsList?.grant
      result.grants = eupmc.grantsList.grant
      result.provenance.push 'Added grants data from EUPMC'
    if eupmc.journalInfo?.dateOfPublication
      if fd = await _formatepmcdate eupmc.journalInfo.dateOfPublication
        result.publication_date = fd
        result.provenance.push 'Added date of publication from EUPMC'
      else
        result._invalid_date_of_publication = eupmc.journalInfo.dateOfPublication
        result.provenance.push 'Could not add invalid date of publication from EUPMC (' + result._invalid_date_of_publication + ')'
    if eupmc.electronicPublicationDate
      if efd = await _formatepmcdate eupmc.electronicPublicationDate
        result.electronic_publication_date = efd
        result.provenance.push 'Added electronic publication date from EUPMC'
      else
        result_invalid_date_of_electronic_publication = eupmc.electronicPublicationDate
        result.provenance.push 'Could not add invalid electronic publication date from EUPMC (' + result_invalid_date_of_electronic_publication + ')'

    if result.pmcid # removed need for being open_access or in_epmc (as according to epmc)
      result.provenance.push 'Checking if XML is available from EUPMC (since 6th March 2020 this is always done for any article we have a PMCID for, regardless of other EUPMC API values).'
      xml = await @src.epmc.xml result.pmcid
      if xml is 404
        fofxml = 'Not found in EUPMC when trying to fetch full text XML.'
        fofxml += ' (We do this for any item we have a PMCID for since 6th March 2020, even if EUPMC indicates not in their open access category and/or fulltext not in EUPMC.'
        result.provenance.push fofxml
      else if typeof xml is 'string' and xml.indexOf('<') is 0
        result.epmc_xml = true
        result.provenance.push 'Confirmed fulltext XML is available from EUPMC'
      else if xml?
        result.provenance.push 'Encountered an error while retrieving the EUPMC full text XML. One possible reason is EUPMC being temporarily unavailable.'

    lic = await @src.epmc.licence result.pmcid, eupmc, xml
    if lic isnt false
      result.licence = lic.licence
      result.epmc_licence = lic.licence
      result.licence_source = lic.source
      result.epmc_licence_source = lic.source
      extrainfo = ''
      if lic.match
        extrainfo += ' If licence statements contain URLs we will try to find those in addition to '
        extrainfo += 'searching for the statement\'s text. The match in this case was: \'' + lic.match.replace(/<.*?>/gi,'') + '\' .'
      result.provenance.push 'Added EPMC licence (' + result.epmc_licence + ') from ' + lic.source + '.' + extrainfo
    else
      result.provenance.push 'Could not find licence via EUPMC'

    if eupmc.authorList?.author
      result.authors = eupmc.authorList.author
      result.provenance.push 'Added author list from EUPMC'
    if result.in_epmc
      aam = await @src.epmc.aam result.pmcid, eupmc
      if aam.aam is false
        result.aam = false
        result.provenance.push 'Checked author manuscript status in EUPMC, found no evidence of being one'
      else if aam.aam is true
        result.aam = true
        result.provenance.push 'Checked author manuscript status in EUPMC, found in ' + aam.info
      else if aam.info.indexOf('404') isnt -1
        result.aam = false
        result.provenance.push 'Unable to locate Author Manuscript information in EUPMC - could not find the article in EUPMC.'
      else if aam.info.indexOf('error') isnt -1
        result.aam = 'unknown'
        result.provenance.push 'Error accessing EUPMC while trying to locate Author Manuscript information. EUPMC could be temporarily unavailable.'
      else if aam.info.indexOf('blocking') isnt -1
        result.aam = 'unknown'
        result.provenance.push 'Error accessing EUPMC while trying to locate Author Manuscript information - EUPMC is blocking access.'
      else
        result.aam = 'unknown'
  else
    result.provenance.push 'Unable to locate article in EPMC.'

  if not result.doi and not result.pmid and not result.pmcid
    result.provenance.push 'Unable to obtain DOI, PMID or PMCID for this article. Compliance information may be severely limited.'

  if result.doi
    crossref = await @src.crossref.works result.doi
    if crossref?
      result.confidence = 1 if not result.confidence
      result.publisher = crossref.publisher
      result.provenance.push 'Added publisher name from Crossref'
      if not result.issn and (crossref.issn or (crossref.ISSN? and crossref.ISSN.length > 0))
        result.issn = crossref.issn ? crossref.ISSN[0]
        result.provenance.push 'Added ISSN from Crossref'
      if not result.journal_title and (crossref.journal or (crossref['container-title']? and crossref['container-title'].length > 0))
        result.journal_title = crossref.journal ? crossref['container-title'][0]
        result.provenance.push 'Added journal title from Crossref'
      if not result.authors and crossref.author
        result.authors = crossref.author
        result.provenance.push 'Added author list from Crossref'
      if not result.title and crossref.title? and crossref.title.length > 0
        result.title = if Array.isArray(crossref.title) then crossref.title[0] else crossref.title
        result.provenance.push 'Added article title from Crossref'
    else
      result.provenance.push 'Unable to obtain information about this article from Crossref.'

    core = await @src.core.doi result.doi
    if core?.id
      result.in_core = true
      result.provenance.push 'Found DOI in CORE'
      if not result.authors and core.authors
        result.authors = core.author
        result.provenance.push 'Added authors from CORE'
      if core.repositories? and core.repositories.length > 0
        for rep in core.repositories
          rc = {name:rep.name}
          rc.oai = rep.oai if rep.oai?
          if rep.uri
            rc.url = rep.uri
          else
            try
              res = await @src.sherpa.opendoar 'repository_metadata.name.name:"' + rep.name + '"'
              if res.hits.hits[0]._source.repository_metadata.name.toLowerCase().indexOf(rep.name.toLowerCase()) isnt -1
                rc.url = repo.repository_metadata.url
                result.provenance.push 'Added repo base URL from OpenDOAR'
              else
                result.provenance.push 'Searched OpenDOAR but could not find repo and/or URL'
            catch
              result.provenance.push 'Tried but failed to search OpenDOAR for repo base URL'
          rc.fulltexts = []
          lastresort = undefined
          if core.fulltextUrls
            for fu in core.fulltextUrls
              if fu.indexOf('core.ac.uk') is -1
                resolved = await @resolve fu
                if resolved and rc.fulltexts.indexOf(resolved) is -1
                  if rc.url and resolved.indexOf(rc.url.replace('http://','').replace('https://','').split('/')[0]) isnt -1
                    rc.fulltexts.unshift resolved
                  else
                    rc.fulltexts.push resolved
              else if not lastresort?
                lastresort = fu
          rc.fulltexts.push(lastresort) if rc.fulltexts.length is 0 and lastresort?
          result.repositories.push rc
        result.provenance.push 'Added repositories that CORE claims article is available from'
      if not result.title and core.title
        result.title = core.title
        result.provenance.push 'Added title from CORE'
    else
      result.in_core = false
      result.provenance.push 'Could not find DOI in CORE'

    base = await @src.base.doi result.doi
    if base?.dclink?
      result.in_base = true
      result.provenance.push 'Found DOI in BASE'
      try
        domain = base.dclink.split('://')[1].split('/')[0]
        res = await @src.sherpa.opendoar 'repository_metadata.url:"' + domain + '"'
        if res.hits.hits[0]._source.repository_metadata.url.toLowerCase().indexOf(domain.toLowerCase()) isnt -1
          rpo = 
            fulltexts: [base.dclink]
            url: res.hits.hits[0]._source.repository_metadata.url
            oai: res.hits.hits[0]._source.repository_metadata.oai_url
          try rpo.name = res.hits.hits[0]._source.repository_metadata.name[0].name
          result.repositories.push rpo
          result.provenance.push 'Added repo base URL from OpenDOAR'
        else
          result.provenance.push 'Searched OpenDOAR but could not find repo and/or URL'
      catch
        result.provenance.push 'Tried but failed to search OpenDOAR for repo base URL'
      if not result.title and base.dctitle
        result.title = base.dctitle
        result.provenance.push 'Added title from BASE'
    else
      result.in_base = false
      result.provenance.push 'Could not find DOI in BASE'

  else
    result.provenance.push 'Not attempting Crossref / CORE / BASE lookups - do not have DOI for article.'

  if result.grants? and result.grants.length > 0
    grants = []
    for gr in result.grants
      if gr.grantId
        grid = gr.grantId
        grid = grid.split('/')[0] if gr.agency and gr.agency.toLowerCase().indexOf('wellcome') isnt -1
        gres = await @src.grist grid
        if gres.total and gres.total > 0 and gres.data.Person
          ps = gres.data.Person
          pid = ''
          pid += ps.Title + ' ' if ps.Title
          pid += ps.GivenName + ' ' if ps.GivenName
          pid += ps.Initials + ' ' if not ps.GivenName and ps.Initials
          pid += ps.FamilyName if ps.FamilyName
          gr.PI = pid
          result.provenance.push 'Found Grant PI for ' + grid + ' via Grist API'
        else
          result.provenance.push 'Tried but failed to find Grant PI via Grist API'
      else
        gr.grantId = 'unknown'
      if gr.agency and gr.agency.toLowerCase().indexOf('wellcome') isnt -1 then grants.unshift(gr) else grants.push(gr)
    result.grants = grants
  else
    result.provenance.push 'Not attempting Grist API grant lookups since no grants data was obtained from EUPMC.'

  if result.pmid and not result.in_epmc
    result.ahead_of_print = await @src.pubmed.aheadofprint result.pmid
    if result.ahead_of_print isnt false
      result.provenance.push 'Checked ahead of print status on pubmed, date found ' + result.ahead_of_print
    else
      result.provenance.push 'Checked ahead of print status on pubmed, no date found'
  else
    msg = 'Not checking ahead of print status on pubmed.'
    msg += ' We don\'t have the article\'s PMID.' if not result.pmid
    msg += ' The article is already in EUPMC.' if result.in_epmc
    result.provenance.push msg

  if result.issn
    for diss in result.issn.split ','
      doaj = await @src.doaj.journals diss
      if doaj?
        result.pure_oa = true
        result.provenance.push 'Confirmed journal is listed in DOAJ'
        result.publisher ?= doaj.bibjson?.publisher?.name
        result.journal_title ?= doaj.bibjson?.title
        break
    if result.pure_oa isnt true
      result.provenance.push 'Could not find journal in DOAJ'

  if not result.issn
    result.provenance.push 'Not attempting to add any data from Open Access Button - don\'t have a journal ISSN to use for lookup.'
  else if not @svc.oaworks?
    result.provenance.push 'Not attempting to add any data from Open Access Button - OAB is not available.'
  else if oa = await @svc.oaworks.find issn: result.issn, permissions: true
    if not result.journal_title
      if oa.metadata?.journal?
        result.journal_title = oa.metadata.journal
        result.provenance.push 'Added journal title Open Access Button'
      else
        result.provenance.push 'Tried, but could not add journal title from Open Access Button.'
    if not result.publisher
      if oa.metadata?.publisher?
        result.publisher = oa.metadata.publisher
        result.provenance.push 'Added publisher from Open Access Button'
      else
        result.provenance.push 'Tried, but could not add publisher from Open Access Button.'
    if oa.permissions?.all_permissions? and oa.permissions.all_permissions.length
      for pm in oa.permissions.all_permissions
        km = if pm.version is 'submittedVersion' then 'preprint' else if pm.version is 'acceptedVersion' then 'postprint' else if pm.version is 'publishedVersion' then 'publisher_copy' else undefined
        if km?
          result[km + '_embargo'] = (if pm.embargo_months then pm.embargo_months + ' months' else '') + (if pm.embargo_end then ' ending ' + pm.embargo_end else '')
          result[km + '_self_archiving'] = pm.deposit_statement
      result.provenance.push 'Added embargo and archiving data from Open Access Button'
    else
      result.provenance.push 'No embargo and archiving data available from Open Access Button'
  else
    result.provenance.push 'Unable to add any data from Open Access Button.'

  publisher_licence_check_ran = false
  if not result.licence or result.licence not in ['cc-by','cc-zero']
    publisher_licence_check_ran = true
    lic = await @svc.lantern.licence 'https://doi.org/'+result.doi
    if lic.licence and lic.licence isnt 'unknown'
      result.licence = lic.licence
      result.licence_source = 'publisher_splash_page'
      result.publisher_licence = lic.licence
      extrainfo = ''
      if lic.match
        extrainfo += ' If licence statements contain URLs we will try to find those in addition to ' +
        'searching for the statement\'s text. The match in this case was: \'' + lic.match.replace(/<.*?>/gi,'') + '\' .'
      result.provenance.push 'Added licence (' + result.publisher_licence + ') via article publisher splash page lookup.' + extrainfo
    else
      result.publisher_licence = 'unknown'
      result.provenance.push 'Unable to retrieve licence data via article publisher splash page lookup.'
      result.provenance.push 'Retrieved content was very long, so was contracted to 500,000 chars from start and end to process' if lic.large
  else
    result.provenance.push 'Not attempting to retrieve licence data via article publisher splash page lookup.'
    publisher_licence_check_ran = false

  result.publisher_licence = "not applicable" if not publisher_licence_check_ran and result.publisher_licence isnt 'unknown'
  result.publisher_licence = 'unknown' if not result.publisher_licence?
  if result.epmc_licence? and result.epmc_licence isnt 'unknown' and not result.epmc_licence.startsWith('cc-')
    result.epmc_licence = 'non-standard-licence'
  if result.publisher_licence? and result.publisher_licence isnt 'unknown' and result.publisher_licence isnt "not applicable" and not result.publisher_licence.startsWith('cc-')
    result.publisher_licence = 'non-standard-licence'

  result.compliance_wellcome_standard = false
  result.compliance_wellcome_deluxe = false
  epmc_compliance_lic = if result.epmc_licence then result.epmc_licence.toLowerCase().replace(/ /g,'').replace(/-/g,'') else ''
  epmc_lics = epmc_compliance_lic in ['ccby','cc0','cczero']
  result.compliance_wellcome_standard = true if result.in_epmc and (result.aam or epmc_lics)
  result.compliance_wellcome_deluxe = true if result.in_epmc and result.aam
  result.compliance_wellcome_deluxe = true if result.in_epmc and epmc_lics and result.open_access

  @svc.lantern.result result
  if last # last is the job ID
    job = if typeof last is 'object' then last else await @svc.lantern.job last
    if job?.email
      text = 'Dear ' + job.email + '\n\nWe\'ve just finished processing a batch of identifiers for you, and you can download the final results here:\n\n'
      text += 'https://compliance.cottagelabs.com#' + job._id + '\n\nIf you didn\'t submit the original request yourself, it probably means '
      text += 'that another service was running it on your behalf, so this is just to keep you informed about what\'s happening with your account; you don\'t need to do anything else.'
      @mail
        from: 'Lantern <lantern@cottagelabs.com>'
        to: job.email
        subject: 'Wellcome Compliance: job ' + (job.name ? job._id) + ' completed successfully'
        text: text

  return result

P.svc.lantern._fields = {
  "pmcid": {"short_name": "PMCID"},
  "pmid": {"short_name": "PMID"},
  "doi": {"short_name": "DOI"},
  "title": {"short_name": "Article title"},
  "journal_title": {"short_name": "Journal title"},
  "pure_oa": {"short_name": "Pure Open Access"},
  "issn": {"short_name": "ISSN"},
  "eissn": {"short_name": "EISSN"},
  "publication_date": {"short_name": "Publication Date"},
  "electronic_publication_date": {"short_name": "Electronic Publication Date"},
  "publisher": {"short_name": "Publisher"},
  "publisher_licence": {"short_name": "Publisher Licence"},
  "epmc_licence": {"short_name": "EPMC Licence"},
  "epmc_licence_source": {"short_name": "EPMC Licence Source"},
  "licence_source": {"short_name": "Licence Source"},
  "licence": {"short_name": "Licence"},
  "in_epmc": {"short_name": "Fulltext in EPMC?"},
  "epmc_xml": {"short_name": "XML Fulltext?"},
  "aam": {"short_name": "AAM?"},
  "open_access": {"short_name": "Open Access"},
  "ahead_of_print": {"short_name": "Ahead of Print?"},
  "romeo_colour": {"short_name": "Sherpa Romeo Colour"},
  "preprint_embargo": {"short_name": "Preprint Embargo"},
  "preprint_self_archiving": {"short_name": "Preprint Self-Archiving Policy"},
  "postprint_embargo": {"short_name": "Postprint Embargo"},
  "postprint_self_archiving": {"short_name": "Postprint Self-Archiving Policy"},
  "publisher_copy_embargo": {"short_name": "Publisher's Copy Embargo"},
  "publisher_copy_self_archiving": {"short_name": "Publisher's Copy Self-Archiving Policy"},
  "authors": {"short_name": "Author(s)"},
  "in_core": {"short_name": "In CORE?"},
  "in_base": {"short_name": "In BASE?"},
  "repositories": {"short_name": "Archived Repositories"},
  "repository_urls": {"short_name": "Repository URLs"},
  "repository_oai_ids": {"short_name": "Repository OAI IDs"},
  "repository_fulltext_urls": {"short_name": "Repository Fulltext URLs"},
  "grant": {"short_name": "Grant {X}"},
  "agency": {"short_name": "Agency {X}"},
  "pi": {"short_name": "PI {X}"},
  "confidence": {"short_name": "Correct Article Confidence"},
  "compliance_wellcome_standard": {"short_name": "Compliance Wellcome Standard"},
  "compliance_wellcome_deluxe": {"short_name": "Compliance Wellcome Deluxe"},
  "provenance": {"short_name": "Provenance"}
}`;


try {
  S.svc.oaworks = JSON.parse(SECRETS_OAWORKS);
} catch (error) {
  S.svc.oaworks = {};
}

P.svc.oaworks = function() {
  if (JSON.stringify(this.params) !== '{}') {
    return {
      status: 404
    };
  } else {
    return {
      name: 'OA.Works API',
      version: this.S.version,
      base: this.S.dev ? this.base : void 0,
      built: this.S.built
    };
  }
};

P.svc.oaworks.templates = {
  _key: 'name',
  _sheet: '16Qm8n3Rmx3QyttFpSGj81_7T6ehfLAtYRSvmDf3pAzg/1'
};

// oab status and stats
// make all request admin via sheet somehow
`P.svc.oaworks.bug = () ->
  if (@body?.contact? and @body.contact.length) or (@body?.email? and @svc.oaworks.validate(@body.email) isnt true)
    return ''
  else
    whoto = ['help@openaccessbutton.org']
    text = ''
    for k of @body
      text += k + ': ' + JSON.stringify(@body[k],undefined,2) + '\n\n'
    text = @tdm.clean text
    subject = '[OAB forms]'
    if @body?.form is 'uninstall' # wrong bug general other
      subject += ' Uninstall notice'
    else if @body?.form is 'wrong'
      subject += ' Wrong article'
    else if @body?.form is 'bug'
      subject += ' Bug'
    else if @body?.form is 'general'
      subject += ' General'
    else
      subject += ' Other'
    subject += ' ' + Date.now()
    if @body?.form in ['wrong','uninstall']
      whoto.push 'natalia.norori@openaccessbutton.org'
    @waitUntil @mail
      service: 'openaccessbutton'
      from: 'natalia.norori@openaccessbutton.org'
      to: whoto
      subject: subject
      text: text
    return
      status: 302
      headers:
        'Content-Type': 'text/plain'
        'Location': (if @S.dev then 'https://dev.openaccessbutton.org' else 'https://openaccessbutton.org') + '/feedback#defaultthanks'
      body: 'Location: ' + (if @S.dev then 'https://dev.openaccessbutton.org' else 'https://openaccessbutton.org') + '/feedback#defaultthanks'


P.svc.oaworks.blacklist = (url) ->
  url ?= @params.url
  url = url.toString() if typeof url is 'number'
  return false if url? and (url.length < 4 or url.indexOf('.') is -1)
  bl = await @src.google.sheets @S.svc.oaworks?.google?.sheets?.blacklist
  blacklist = []
  blacklist.push(i.url) for i in bl
  if url
    if url.indexOf('http') isnt 0 and url.indexOf(' ') isnt -1
      return false # sometimes article titles get sent here, no point checking them on the blacklist
    else
      for b in blacklist
        return true if url.indexOf(b) isnt -1
      return false
  else
    return blacklist


P.svc.oaworks.validate = (email, domain, verify=true) ->
  email ?= @params.email
  bad = ['eric@talkwithcustomer.com']
  if typeof email isnt 'string' or email.indexOf(',') isnt -1 or email in bad
    return false
  else if email.indexOf('@openaccessbutton.org') isnt -1 or email.indexOf('@email.ghostinspector.com') isnt -1 #or email in []
    return true
  else
    v = await @mail.validate email, @S.svc.oaworks.mail.pubkey
    if v.is_valid and (not verify or v.mailbox_verification in [true,'true'])
      return true
    else if v.did_you_mean
      return v.did_you_mean
    else
      return false


# LIVE: https://docs.google.com/spreadsheets/d/1Te9zcQtBLq2Vx81JUE9R42fjptFGXY6jybXBCt85dcs/edit#gid=0
# Develop: https://docs.google.com/spreadsheets/d/1AaY7hS0D9jtLgVsGO4cJuLn_-CzNQg0yCreC3PP3UU0/edit#gid=0
P.svc.oaworks.redirect = (url) ->
  return false if await @svc.oaworks.blacklist(url) is true # ignore anything on the usual URL blacklist
  list = await @src.google.sheets @S.svc.oaworks?.google?.sheets?.redirect, 360000
  for listing in list
    if listing.redirect and url.replace('http://','').replace('https://','').split('#')[0] is listing.redirect.replace('http://','').replace('https://','').split('#')[0]
      # we have an exact alternative for this url
      return listing.redirect
    else if typeof url is 'string' and url.indexOf(listing.domain.replace('http://','').replace('https://','').split('/')[0]) isnt -1
      url = url.replace('http://','https://') if listing.domain.indexOf('https://') is 0
      listing.domain = listing.domain.replace('http://','https://') if url.indexOf('https://') is 0
      if (listing.fulltext and listing.splash and listing.identifier) or listing.element
        source = url
        if listing.fulltext
          # switch the url by comparing the fulltext and splash examples, and converting the url in the same way
          parts = listing.splash.split listing.identifier
          if url.indexOf(parts[0]) is 0 # can only successfully replace if the incoming url starts with the same as the start of the splash url
            diff = url.replace parts[0], ''
            diff = diff.replace(parts[1],'') if parts.length > 1
            url = listing.fulltext.replace listing.identifier, diff
        else if listing.element and url.indexOf('.pdf') is -1
          try
            content = await @fetch url # should really be a puppeteer render
            url = content.toLowerCase().split(listing.element.toLowerCase())[1].split('"')[0].split("'")[0].split('>')[0]
        return false if (not url? or url.length < 6 or url is source) and listing.blacklist is "yes"
      else if listing.loginwall and url.indexOf(listing.loginwall.replace('http://','').replace('https://','')) isnt -1
        # this url is on the login wall of the repo in question, so it is no use
        return false
      else if listing.blacklist is "yes"
        return false
  if typeof url is 'string'
    # some URLs can be confirmed as resolvable but we also hit a captcha response and end up serving that to the user
    # we introduced this because of issue https://github.com/OAButton/discussion/issues/1257
    # and for example https://www.tandfonline.com/doi/pdf/10.1080/17521740701702115?needAccess=true
    # ends up as https://www.tandfonline.com/action/captchaChallenge?redirectUri=%2Fdoi%2Fpdf%2F10.1080%2F17521740701702115%3FneedAccess%3Dtrue
    for avoid in ['captcha','challenge']
      return undefined if url.toLowerCase().indexOf(avoid) isnt -1
  return url`;

// need listing of deposits and deposited for each user ID
// and/or given a uid, find the most recent URL that this users uid submitted a deposit for
// need to handle old/new user configs somehow - just store all the old ones and let the UI pick them up
// make sure all users submit the config with the incoming query (for those that still don't, temporarily copy them from old imported ones)

// NOTE to receive files cloudflare should be setup to DNS route this directly to backend, and any calls to it should call that dns subdomain
// because otherwise cloudflare will limit file upload size (100mb by default, and enterprise plans required for more)
// however also busboy is required, so needs to be a direct call to backend
P.svc.oaworks.deposit = async function(params, files, dev) {
  var a, as, at, author, bcc, ccm, com, creators, dep, description, ed, i, in_zenodo, j, k, l, len, len1, len2, len3, len4, m, meta, ml, n, perms, ref, ref1, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref18, ref19, ref2, ref20, ref21, ref22, ref23, ref24, ref25, ref26, ref27, ref28, ref29, ref3, ref30, ref31, ref32, ref33, ref34, ref35, ref36, ref4, ref5, ref6, ref7, ref8, ref9, tk, tmpl, tos, uc, z, zn;
  // so need some metadata in params.metadata
  if (params == null) {
    params = this.copy(this.params);
  }
  if (files == null) {
    files = this.request.files; // TODO check where these will end up - will they only work on bg with busboy?
  }
  dep = {
    zenodo: {}
  };
  ref = ['embedded', 'demo', 'pilot', 'live', 'email', 'plugin'];
  for (i = 0, len = ref.length; i < len; i++) {
    k = ref[i];
    dep[k] = params[k];
  }
  dep.pilot = dep.pilot === true ? Date.now() : void 0;
  dep.live = dep.live === true ? Date.now() : void 0;
  if ((files != null) && files.length) {
    dep.name = (ref1 = files[0].filename) != null ? ref1 : files[0].name;
  }
  if (params.from !== 'anonymous') { // should it still be possible to deposit anonymously?
    dep.from = params.from;
  }
  if (params.confirmed) { // if confirmed is true the submitter has confirmed this is the right file. If confirmed is the checksum this is a resubmit by an admin
    dep.confirmed = decodeURIComponent(params.confirmed);
  }
  uc = params.config; // should exist but may not
  if (typeof params.config === 'string') {
    uc = JSON.parse(params.config);
  }
  if (!params.config && params.from) {
    uc = (await this.fetch('https://' + (this.S.dev || dev ? 'dev.' : '') + 'api.cottagelabs.com/service/oab/deposit/config?uid=' + params.from));
  }
  perms = (await this.svc.oaworks.permissions(params.metadata)); // should metadata be retrieved if not present? default to looking for a doi or similar somewhere else in params?
  // TODO move file check into here, not in permissions any more
  if (((ref2 = perms.file) != null ? ref2.archivable : void 0) && (((dep.confirmed != null) && dep.confirmed === perms.file.checksum) || !dep.confirmed)) { // if the depositor confirms we don't deposit, we manually review - only deposit on admin confirmation (but on dev allow it)
    zn = {
      content: files[0].data,
      name: perms.file.name
    };
    zn.publish = ((ref3 = this.S.svc.oaworks) != null ? (ref4 = ref3.deposit) != null ? ref4.zenodo : void 0 : void 0) === true;
    creators = [];
    ref7 = (ref5 = (ref6 = params.metadata) != null ? ref6.author : void 0) != null ? ref5 : [];
    for (j = 0, len1 = ref7.length; j < len1; j++) {
      a = ref7[j];
      if (a.family != null) {
        at = {
          name: a.family + (a.given ? ', ' + a.given : '')
        };
        try {
          if (a.ORCID) {
            at.orcid = a.ORCID.split('/').pop();
          }
        } catch (error) {}
        try {
          if (typeof a.affiliation === 'object' && (a.affiliation.name != null)) {
            at.affiliation = a.affiliation.name;
          }
        } catch (error) {}
        creators.push(at);
      }
    }
    if (creators.length === 0) {
      creators = [
        {
          name: 'Unknown'
        }
      ];
    }
    description = params.metadata.abstract ? params.metadata.abstract + '<br><br>' : '';
    description += (ref8 = (ref9 = perms.best_permission) != null ? ref9.deposit_statement : void 0) != null ? ref8 : (params.metadata.doi != null ? 'The publisher\'s final version of this work can be found at https://doi.org/' + d.metadata.doi : '');
    description = description.trim();
    if (description.lastIndexOf('.') !== description.length - 1) {
      description += '.';
    }
    if (description.length) {
      description += ' ';
    }
    description += '<br><br>Deposited by shareyourpaper.org and openaccessbutton.org. We\'ve taken reasonable steps to ensure this content doesn\'t violate copyright. However, if you think it does you can request a takedown by emailing help@openaccessbutton.org.';
    meta = {
      title: (ref10 = params.metadata.title) != null ? ref10 : 'Unknown',
      description: description.trim(),
      creators: creators,
      version: perms.file.version === 'preprint' ? 'Submitted Version' : perms.file.version === 'postprint' ? 'Accepted Version' : perms.file.version === 'publisher pdf' ? 'Published Version' : 'Accepted Version',
      journal_title: params.metadata.journal,
      journal_volume: params.metadata.volume,
      journal_issue: params.metadata.issue,
      journal_pages: params.metadata.page
    };
    //meta.keywords = params.metadata.keyword if Array.isArray(params.metadata.keyword) and params.metadata.keyword.length and typeof params.metadata.keyword[0] is 'string'
    if (params.metadata.doi != null) {
      in_zenodo = (await this.src.zenodo.records.doi(params.metadata.doi));
      if (in_zenodo && dep.confirmed !== perms.file.checksum && !this.S.dev && !dev) {
        dep.zenodo.already = in_zenodo.id; // we don't put it in again although we could with doi as related field - but leave for review for now
      } else if (in_zenodo) {
        meta['related_identifiers'] = [
          {
            relation: (meta.version === 'postprint' || meta.version === 'AAM' || meta.version === 'preprint' ? 'isPreviousVersionOf' : 'isIdenticalTo'),
            identifier: d.metadata.doi
          }
        ];
      } else {
        meta.doi = params.metadata.doi;
      }
    } else if ((ref11 = this.S.svc.oaworks.zenodo) != null ? ref11.prereserve_doi : void 0) {
      meta.prereserve_doi = true;
    }
    meta['access_right'] = 'open';
    meta.license = (ref12 = (ref13 = perms.best_permission) != null ? ref13.licence : void 0) != null ? ref12 : 'cc-by'; // zenodo also accepts other-closed and other-nc, possibly more
    if (meta.license.indexOf('other') !== -1 && meta.license.indexOf('closed') !== -1) {
      meta.license = 'other-closed';
    }
    if (meta.license.indexOf('other') !== -1 && meta.license.indexOf('non') !== -1 && meta.license.indexOf('commercial') !== -1) {
      meta.license = 'other-nc';
    }
    if (meta.license.toLowerCase().indexOf('cc') === 0 && isNaN(parseInt(meta.license.substring(meta.license.length - 1)))) {
      meta.license += '-4.0';
    }
    try {
      if (((ref14 = perms.best_permission) != null ? ref14.embargo_end : void 0) && moment(perms.best_permission.embargo_end, 'YYYY-MM-DD').valueOf() > Date.now()) {
        meta['access_right'] = 'embargoed';
        meta['embargo_date'] = perms.best_permission.embargo_end; // check date format required by zenodo
      }
    } catch (error) {}
    try {
      if ((params.metadata.published != null) && typeof params.metadata.published === 'string') {
        meta['publication_date'] = params.metadata.published;
      }
    } catch (error) {}
    if (uc) {
      if ((uc.community_ID != null) && (uc.community == null)) {
        uc.community = uc.community_ID;
      }
      if (uc.community) {
        if (uc.communities == null) {
          uc.communities = [];
        }
        ref15 = (typeof uc.community === 'string' ? uc.community.split(',') : uc.community);
        for (l = 0, len2 = ref15.length; l < len2; l++) {
          ccm = ref15[l];
          uc.communities.push({
            identifier: ccm
          });
        }
      }
      if ((uc.community != null) || (uc.communities != null)) {
        if (uc.communities == null) {
          uc.communities = uc.community;
        }
        if (!Array.isArray(uc.communities)) {
          uc.communities = [uc.communities];
        }
        meta['communities'] = [];
        ref16 = uc.communities;
        for (m = 0, len3 = ref16.length; m < len3; m++) {
          com = ref16[m];
          meta.communities.push(typeof com === 'string' ? {
            identifier: com
          } : com);
        }
      }
    }
    tk = this.S.dev || dev || dep.demo ? (ref17 = this.S.svc.oaworks) != null ? (ref18 = ref17.zenodo) != null ? ref18.sandbox : void 0 : void 0 : (ref19 = this.S.svc.oaworks) != null ? (ref20 = ref19.zenodo) != null ? ref20.token : void 0 : void 0;
    if (tk) {
      if (!dep.zenodo.already) {
        z = (await this.src.zenodo.deposition.create(meta, zn, tk));
        if (z.id) {
          dep.zenodo.id = z.id;
          dep.zenodo.url = 'https://' + (this.S.dev || dev || dep.demo ? 'sandbox.' : '') + 'zenodo.org/record/' + z.id;
          if (((ref21 = z.metadata) != null ? (ref22 = ref21.prereserve_doi) != null ? ref22.doi : void 0 : void 0) != null) {
            dep.zenodo.doi = z.metadata.prereserve_doi.doi;
          }
          dep.zenodo.file = (ref23 = (ref24 = z.uploaded) != null ? (ref25 = ref24.links) != null ? ref25.download : void 0 : void 0) != null ? ref23 : (ref26 = z.uploaded) != null ? (ref27 = ref26.links) != null ? ref27.download : void 0 : void 0;
        } else {
          dep.error = 'Deposit to Zenodo failed';
          try {
            dep.error += ': ' + JSON.stringify(z);
          } catch (error) {}
        }
      }
    } else {
      dep.error = 'No Zenodo credentials available';
    }
  }
  if (((ref28 = perms.file) != null ? ref28.version : void 0) != null) {
    dep.version = perms.file.version;
  }
  if (dep.zenodo.id) {
    if (((ref29 = perms.best_permission) != null ? ref29.embargo_end : void 0) && moment(perms.best_permission.embargo_end, 'YYYY-MM-DD').valueOf() > Date.now()) {
      dep.embargo = perms.best_permission.embargo_end;
    }
    dep.type = 'zenodo';
  } else if ((dep.error != null) && dep.error.toLowerCase().indexOf('zenodo') !== -1) {
    dep.type = 'review';
  } else if (params.from && (!dep.embedded || (dep.embedded.indexOf('oa.works') === -1 && dep.embedded.indexOf('openaccessbutton.org') === -1 && dep.embedded.indexOf('shareyourpaper.org') === -1))) {
    dep.type = params.redeposit ? 'redeposit' : (files != null) && files.length ? 'forward' : 'dark';
  } else {
    dep.type = 'review';
  }
  bcc = ['joe@openaccessbutton.org', 'natalia.norori@openaccessbutton.org'];
  tos = [];
  if (typeof (uc != null ? uc.owner : void 0) === 'string' && uc.owner.indexOf('@') !== -1) {
    tos.push(uc.owner);
  } else if (uc.email) {
    tos.push(uc.email);
  }
  if (tos.length === 0) {
    tos = this.copy(bcc);
    bcc = [];
  }
  dep.url = typeof params.redeposit === 'string' ? params.redeposit : params.url ? params.url : void 0;
  ed = this.copy(dep);
  if (((ref30 = ed.metadata) != null ? ref30.author : void 0) != null) {
    as = [];
    ref31 = ed.metadata.author;
    for (n = 0, len4 = ref31.length; n < len4; n++) {
      author = ref31[n];
      if (author.family) {
        as.push((author.given ? author.given + ' ' : '') + author.family);
      }
    }
    ed.metadata.author = as;
  }
  ed.adminlink = (ed.embedded ? ed.embedded : 'https://shareyourpaper.org' + (((ref32 = ed.metadata) != null ? ref32.doi : void 0) != null ? '/' + ed.metadata.doi : ''));
  ed.adminlink += ed.adminlink.indexOf('?') === -1 ? '?' : '&';
  if ((perms != null ? (ref33 = perms.file) != null ? ref33.checksum : void 0 : void 0) != null) {
    ed.confirmed = encodeURIComponent(perms.file.checksum);
    ed.adminlink += 'confirmed=' + ed.confirmed + '&';
  }
  ed.adminlink += 'email=' + ed.email;
  tmpl = (await this.svc.oaworks.templates(dep.type + '_deposit.html'));
  tmpl = tmpl.content;
  if (((ref34 = perms.file) != null ? ref34.archivable : void 0) !== false) { // so when true or when undefined if no file is given
    ml = {
      from: 'deposits@openaccessbutton.org',
      to: tos,
      template: tmpl,
      vars: ed,
      subject: (ref35 = sub.subject) != null ? ref35 : dep.type + ' deposit',
      html: sub.content
    };
    if (bcc.length) { // passing undefined to mail seems to cause errors, so only set if definitely exists
      ml.bcc = bcc;
    }
    if (Array.isArray(files) && files.length) {
      ml.attachments = [
        {
          filename: (ref36 = files[0].filename) != null ? ref36 : files[0].name,
          content: files[0].data
        }
      ];
    }
    this.waitUntil(this.mail(ml));
  }
  return dep;
};

P.svc.oaworks.deposit._index = true; // store a record of all deposits

var indexOf = [].indexOf;

P.svc.oaworks.metadata = async function(doi) {
  var res;
  res = (await this.svc.oaworks.find(doi)); // may not be a DOI, but most likely thing
  return res != null ? res.metadata : void 0;
};

P.svc.oaworks.find = async function(options, metadata = {}, content) {
  var _ill, _metadata, _permissions, _searches, bct, bong, dd, dps, i, len, mct, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, ref8, res, uo;
  res = {};
  _metadata = async(input) => {
    var ct, k;
    ct = (await this.svc.oaworks.citation(input));
    for (k in ct) {
      if (k === 'url' || k === 'paywall') {
        if (res[k] == null) {
          res[k] = ct[k];
        }
      } else {
        if (metadata[k] == null) {
          metadata[k] = ct[k];
        }
      }
    }
    return true;
  };
  if (typeof options === 'string') {
    options = {
      doi: options
    };
  }
  try {
    if (options == null) {
      options = this.copy(this.params);
    }
  } catch (error) {}
  if (options == null) {
    options = {};
  }
  if (content == null) {
    content = (ref = options.dom) != null ? ref : (typeof this.body === 'string' ? this.body : void 0);
  }
  if (options.metadata) {
    options.find = options.metadata;
  }
  if (options.find) {
    if (options.find.indexOf('10.') === 0 && options.find.indexOf('/') !== -1) {
      options.doi = options.find;
    } else {
      options.url = options.find;
    }
    delete options.find;
  }
  if (options.url == null) {
    options.url = (ref1 = options.q) != null ? ref1 : options.id;
  }
  if (options.url) {
    if (typeof options.url === 'number') {
      options.url = options.url.toString();
    }
    if (options.url.indexOf('/10.') !== -1) {
      // we don't use a regex to try to pattern match a DOI because people often make mistakes typing them, so instead try to find one
      // in ways that may still match even with different expressions (as long as the DOI portion itself is still correct after extraction we can match it)
      dd = '10.' + options.url.split('/10.')[1].split('&')[0].split('#')[0];
      if (dd.indexOf('/') !== -1 && dd.split('/')[0].length > 6 && dd.length > 8) {
        dps = dd.split('/');
        if (dps.length > 2) {
          dd = dps.join('/');
        }
        if (metadata.doi == null) {
          metadata.doi = dd;
        }
      }
    }
    if (options.url.replace('doi:', '').replace('doi.org/', '').trim().indexOf('10.') === 0) {
      if (metadata.doi == null) {
        metadata.doi = options.url.replace('doi:', '').replace('doi.org/', '').trim();
      }
      options.url = 'https://doi.org/' + metadata.doi;
    } else if (options.url.toLowerCase().indexOf('pmc') === 0) {
      if (metadata.pmcid == null) {
        metadata.pmcid = options.url.toLowerCase().replace('pmcid', '').replace('pmc', '');
      }
      options.url = 'http://europepmc.org/articles/PMC' + metadata.pmcid;
    } else if (options.url.replace(/pmid/i, '').replace(':', '').length < 10 && options.url.indexOf('.') === -1 && !isNaN(parseInt(options.url.replace(/pmid/i, '').replace(':', '').trim()))) {
      if (metadata.pmid == null) {
        metadata.pmid = options.url.replace(/pmid/i, '').replace(':', '').trim();
      }
      options.url = 'https://www.ncbi.nlm.nih.gov/pubmed/' + metadata.pmid;
    } else if ((metadata.title == null) && options.url.indexOf('http') !== 0) {
      if (options.url.indexOf('{') !== -1 || ((ref2 = options.url.replace('...', '').match(/\./gi)) != null ? ref2 : []).length > 3 || ((ref3 = options.url.match(/\(/gi)) != null ? ref3 : []).length > 2) {
        options.citation = options.url;
      } else {
        metadata.title = options.url;
      }
    }
    if (options.url.indexOf('http') !== 0 || options.url.indexOf('.') === -1) {
      delete options.url;
    }
  }
  if (typeof options.title === 'string' && (options.title.indexOf('{') !== -1 || ((ref4 = options.title.replace('...', '').match(/\./gi)) != null ? ref4 : []).length > 3 || ((ref5 = options.title.match(/\(/gi)) != null ? ref5 : []).length > 2)) {
    options.citation = options.title; // titles that look like citations
    delete options.title;
  }
  if (metadata.doi == null) {
    metadata.doi = options.doi;
  }
  if (metadata.title == null) {
    metadata.title = options.title;
  }
  if (metadata.pmid == null) {
    metadata.pmid = options.pmid;
  }
  if (metadata.pmcid == null) {
    metadata.pmcid = (ref6 = options.pmcid) != null ? ref6 : options.pmc;
  }
  if (options.citation) {
    await _metadata(options.citation);
  }
  try {
    metadata.title = metadata.title.replace(/(<([^>]+)>)/g, '').replace(/\+/g, ' ').trim();
  } catch (error) {}
  try {
    metadata.title = (await this.decode(metadata.title));
  } catch (error) {}
  try {
    metadata.doi = metadata.doi.split(' ')[0].replace('http://', '').replace('https://', '').replace('doi.org/', '').replace('doi:', '').trim();
  } catch (error) {}
  if (typeof metadata.doi !== 'string' || metadata.doi.indexOf('10.') !== 0) {
    delete metadata.doi;
  }
  // switch exlibris URLs for titles, which the scraper knows how to extract, because the exlibris url would always be the same
  if (!metadata.title && content && typeof options.url === 'string' && (options.url.indexOf('alma.exlibrisgroup.com') !== -1 || options.url.indexOf('/exlibristest') !== -1)) {
    delete options.url;
  }
  if (options.demo != null) {
    // set a demo tag in certain cases
    // e.g. for instantill/shareyourpaper/other demos - dev and live demo accounts
    res.demo = options.demo;
  }
  if ((metadata.doi === '10.1234/567890' || ((metadata.doi != null) && metadata.doi.indexOf('10.1234/oab-syp-') === 0)) || metadata.title === 'Engineering a Powerfully Simple Interlibrary Loan Experience with InstantILL' || ((ref7 = options.from) === 'qZooaHWRz9NLFNcgR' || ref7 === 'eZwJ83xp3oZDaec86')) {
    if (res.demo == null) {
      res.demo = true;
    }
  }
  if (res.demo) { // don't save things coming from the demo accounts into the catalogue later
    if (res.test == null) {
      res.test = true;
    }
  }
  _searches = async() => {
    var _crd, _fatcat, _oad, cr, epmc, mag, ref8, scraped;
    if (((content != null) || (options.url != null)) && !(metadata.doi || (metadata.pmid != null) || (metadata.pmcid != null) || (metadata.title != null))) {
      scraped = (await this.svc.oaworks.scrape(content != null ? content : options.url));
      await _metadata(scraped);
    }
    if (!metadata.doi) {
      if (metadata.pmid || metadata.pmcid) {
        epmc = (await this.src.epmc[metadata.pmcid ? 'pmc' : 'pmid']((ref8 = metadata.pmcid) != null ? ref8 : metadata.pmid));
        await _metadata(epmc);
      }
      if (!metadata.doi && metadata.title && metadata.title.length > 8 && metadata.title.split(' ').length > 1) {
        metadata.title = metadata.title.replace(/\+/g, ' '); // some+titles+come+in+like+this
        cr = (await this.src.crossref.works.title(metadata.title));
        if ((cr != null ? cr.type : void 0) && (cr != null ? cr.DOI : void 0)) {
          await _metadata(cr);
        }
        if (!metadata.doi) {
          mag = (await this.src.microsoft.graph(metadata.title));
          if (mag != null ? mag.PaperTitle : void 0) {
            await _metadata(mag);
          }
        }
        if (!metadata.doi && (epmc == null)) { // run this only if we don't find in our own stores
          epmc = (await this.src.epmc.title(metadata.title));
          await _metadata(epmc);
        }
      }
    }
    if (metadata.doi) {
      _fatcat = async() => {
        var f, fat, fu, i, j, len, len1, ref10, ref9;
        fat = (await this.src.fatcat(metadata.doi));
        if ((fat != null ? fat.files : void 0) != null) {
          ref9 = fat.files;
          for (i = 0, len = ref9.length; i < len; i++) {
            f = ref9[i];
            // there are also hashes and revision IDs, but without knowing details about which is most recent just grab the first
            // looks like the URLs are timestamped, and looks like first is most recent, so let's just assume that.
            if (f.mimetype.toLowerCase().indexOf('pdf') !== -1 && f.state === 'active') { // presumably worth knowing...
              ref10 = f.urls;
              for (j = 0, len1 = ref10.length; j < len1; j++) {
                fu = ref10[j];
                if (fu.url && fu.rel === 'webarchive') { // would we want the web or the webarchive version?
                  res.url = fu.url;
                  break;
                }
              }
            }
          }
        }
        return true;
      };
      _oad = async() => {
        var oad;
        oad = (await this.src.oadoi(metadata.doi));
        if ((oad != null ? oad.doi : void 0) && (oad != null ? oad.doi.toLowerCase() : void 0) === metadata.doi.toLowerCase()) {
          await _metadata(oad);
        }
        return true;
      };
      _crd = async() => {
        cr = (await this.src.crossref.works(metadata.doi));
        if (!(cr != null ? cr.type : void 0)) {
          res.doi_not_in_crossref = metadata.doi;
          if (typeof options.url === 'string' && options.url.indexOf('doi.org/' + metadata.doi) !== -1) {
            delete options.url;
          }
          delete metadata.doi;
        } else {
          await _metadata(cr);
        }
        return true;
      };
      await Promise.all([
        _oad(),
        _crd() // _fatcat(), 
      ]);
    }
    return true;
  };
  await _searches();
  // if nothing useful can be found and still only have title try using bing - or drop this ability?
  // TODO what to do if this finds anything? re-call the whole find?
  if (!metadata.doi && !content && !options.url && (typeof epmc === "undefined" || epmc === null) && metadata.title && metadata.title.length > 8 && metadata.title.split(' ').length > 1) {
    try {
      mct = unidecode(metadata.title.toLowerCase()).replace(/[^a-z0-9 ]+/g, " ").replace(/\s\s+/g, ' ');
      bong = (await this.src.microsoft.bing.search(mct));
      if (((bong != null ? bong.data : void 0) != null) && bong.data.length) {
        bct = unidecode(bong.data[0].name.toLowerCase()).replace('(pdf)', '').replace(/[^a-z0-9 ]+/g, " ").replace(/\s\s+/g, ' ');
        if (mct.replace(/ /g, '').indexOf(bct.replace(/ /g, '')) === 0 && !(await this.svc.oaworks.blacklist(bong.data[0].url))) {
          // if the URL is usable and tidy bing title is a partial match to the start of the provided title, try using it
          options.url = bong.data[0].url.replace(/"/g, '');
          if (typeof options.url === 'string' && options.url.indexOf('pubmed.ncbi') !== -1) {
            metadata.pmid = options.url.replace(/\/$/, '').split('/').pop();
          }
          if (typeof options.url === 'string' && options.url.indexOf('/10.') !== -1) {
            if (metadata.doi == null) {
              metadata.doi = '10.' + options.url.split('/10.')[1];
            }
          }
        }
      }
      if (metadata.doi || metadata.pmid || options.url) {
        await _searches(); // run again if anything more useful found
      }
    } catch (error) {}
  }
  _ill = async() => {
    var ref8;
    if ((metadata.doi || (metadata.title && metadata.title.length > 8 && metadata.title.split(' ').length > 1)) && (options.from || (options.config != null)) && (options.plugin === 'instantill' || options.ill === true)) {
      try {
        if (res.ill == null) {
          res.ill = {
            subscription: (await this.svc.oaworks.ill.subscription((ref8 = options.config) != null ? ref8 : options.from, metadata))
          };
        }
      } catch (error) {}
    }
    return true;
  };
  _permissions = async() => {
    var ref8;
    if (metadata.doi && (options.permissions || options.plugin === 'shareyourpaper')) {
      if (res.permissions == null) {
        res.permissions = (await this.svc.oaworks.permissions(metadata, (ref8 = options.config) != null ? ref8.ror : void 0, false));
      }
    }
    return true;
  };
  await Promise.all([_ill(), _permissions()]);
  ref8 = ['title', 'journal', 'year', 'doi'];
  // certain user-provided search values are allowed to override any that we could find ourselves
  // TODO is this ONLY relevant to ILL? or anything else?
  for (i = 0, len = ref8.length; i < len; i++) {
    uo = ref8[i];
    if (options[uo] && options[uo] !== metadata[uo]) {
      metadata[uo] = options[uo];
    }
  }
  res.metadata = metadata; // if JSON.stringify(metadata) isnt '{}'
  return res;
};

// Yi-Jeng Chen. (2016). Young Children's Collaboration on the Computer with Friends and Acquaintances. Journal of Educational Technology & Society, 19(1), 158-170. Retrieved November 19, 2020, from http://www.jstor.org/stable/jeductechsoci.19.1.158
// Baker, T. S., Eisenberg, D., & Eiserling, F. (1977). Ribulose Bisphosphate Carboxylase: A Two-Layered, Square-Shaped Molecule of Symmetry 422. Science, 196(4287), 293-295. doi:10.1126/science.196.4287.293
P.svc.oaworks.citation = function(citation) {
  var a, aff, ak, au, bt, cf, clc, cn, i, j, k, key, l, len, len1, len2, len3, len4, len5, len6, len7, len8, len9, m, mn, n, o, p, pt, pts, q, r, ref, ref1, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref18, ref19, ref2, ref20, ref21, ref22, ref23, ref24, ref25, ref26, ref27, ref28, ref29, ref3, ref30, ref31, ref32, ref33, ref34, ref35, ref36, ref37, ref38, ref39, ref4, ref40, ref41, ref42, ref43, ref44, ref45, ref46, ref47, ref48, ref49, ref5, ref50, ref51, ref52, ref53, ref54, ref55, ref56, ref57, ref6, ref7, ref8, ref9, res, rmn, rt, s, sy, t, u, v;
  res = {};
  try {
    if (citation == null) {
      citation = (ref = this.params.citation) != null ? ref : this.params;
    }
  } catch (error) {}
  if (typeof citation === 'string' && (citation.indexOf('{') === 0 || citation.indexOf('[') === 0)) {
    try {
      citation = JSON.parse(citation);
    } catch (error) {}
  }
  if (typeof citation === 'object') {
    res.doi = (ref1 = citation.DOI) != null ? ref1 : citation.doi;
    if (citation.pmid) {
      res.pmid = citation.pmid;
    }
    if (citation.pmcid) {
      res.pmcid = citation.pmcid;
    }
    try {
      res.type = (ref2 = citation.type) != null ? ref2 : citation.genre;
    } catch (error) {}
    if (res.issn == null) {
      res.issn = (ref3 = (ref4 = (ref5 = citation.ISSN) != null ? ref5 : citation.issn) != null ? ref4 : (ref6 = citation.journalInfo) != null ? (ref7 = ref6.journal) != null ? ref7.issn : void 0 : void 0) != null ? ref3 : (ref8 = citation.journal) != null ? ref8.issn : void 0;
    }
    if (((ref9 = citation.journalInfo) != null ? (ref10 = ref9.journal) != null ? ref10.eissn : void 0 : void 0) != null) {
      if (res.issn == null) {
        res.issn = [];
      }
      if (typeof res.issn === 'string') {
        res.issn = [res.issn];
      }
      res.issn.push(citation.journalInfo.journal.eissn);
    }
    if (citation.journal_issns) {
      if (res.issn == null) {
        res.issn = citation.journal_issns.split(',');
      }
    }
    try {
      if (Array.isArray(citation.title)) {
        if (res.title == null) {
          res.title = citation.title[0];
        }
      }
    } catch (error) {}
    try {
      if ((citation.subtitle != null) && citation.subtitle.length && citation.subtitle[0].length) {
        res.title += ': ' + citation.subtitle[0];
      }
    } catch (error) {}
    if (res.title == null) {
      res.title = (ref11 = citation.dctitle) != null ? ref11 : (ref12 = citation.bibjson) != null ? ref12.title : void 0;
    }
    if ((ref13 = citation.title) !== 404 && ref13 !== '404') {
      if (res.title == null) {
        res.title = citation.title;
      }
    }
    if (typeof res.title === 'string') {
      res.title = res.title.replace(/\s\s+/g, ' ').trim();
    }
    try {
      if (res.journal == null) {
        res.journal = citation['container-title'][0];
      }
    } catch (error) {}
    try {
      res.shortname = citation['short-container-title'][0];
    } catch (error) {}
    try {
      res.shortname = (ref14 = citation.journalInfo.journal.isoabbreviation) != null ? ref14 : citation.journalInfo.journal.medlineAbbreviation;
    } catch (error) {}
    if (res.journal == null) {
      res.journal = (ref15 = (ref16 = citation.journal_name) != null ? ref16 : (ref17 = citation.journalInfo) != null ? (ref18 = ref17.journal) != null ? ref18.title : void 0 : void 0) != null ? ref15 : (ref19 = citation.journal) != null ? ref19.title : void 0;
    }
    if (citation.journal) {
      res.journal = citation.journal.split('(')[0].trim();
    }
    try {
      ref20 = ['title', 'journal'];
      for (i = 0, len = ref20.length; i < len; i++) {
        key = ref20[i];
        res[key] = res[key].charAt(0).toUpperCase() + res[key].slice(1);
      }
    } catch (error) {}
    if (res.publisher == null) {
      res.publisher = citation.publisher;
    }
    if (res.publisher) {
      res.publisher = res.publisher.trim();
    }
    try {
      if (citation.issue != null) {
        if (res.issue == null) {
          res.issue = citation.issue;
        }
      }
    } catch (error) {}
    try {
      if ((ref21 = citation.journalInfo) != null ? ref21.issue : void 0) {
        if (res.issue == null) {
          res.issue = citation.journalInfo.issue;
        }
      }
    } catch (error) {}
    try {
      if (citation.volume != null) {
        if (res.volume == null) {
          res.volume = citation.volume;
        }
      }
    } catch (error) {}
    try {
      if ((ref22 = citation.journalInfo) != null ? ref22.volume : void 0) {
        if (res.volume == null) {
          res.volume = citation.journalInfo.volume;
        }
      }
    } catch (error) {}
    try {
      if (citation.page != null) {
        if (res.page == null) {
          res.page = citation.page.toString();
        }
      }
    } catch (error) {}
    if (citation.pageInfo) {
      res.page = citation.pageInfo.toString();
    }
    if (citation.abstract || citation.abstractText) {
      res.abstract = (ref23 = citation.abstract) != null ? ref23 : citation.abstractText;
    }
    try {
      if (res.abstract) {
        res.abstract = this.convert.html2txt(res.abstract).replace(/\n/g, ' ').replace('Abstract ', '');
      }
    } catch (error) {}
    ref24 = ['published-print', 'journal-issue.published-print', 'journalInfo.printPublicationDate', 'firstPublicationDate', 'journalInfo.electronicPublicationDate', 'published', 'published_date', 'issued', 'published-online', 'created', 'deposited', 'indexed'];
    for (j = 0, len1 = ref24.length; j < len1; j++) {
      p = ref24[j];
      if (!res.published || res.DOI) {
        if (rt = (ref25 = (ref26 = citation[p]) != null ? ref26 : (ref27 = citation['journal-issue']) != null ? ref27[p.replace('journal-issue.', '')] : void 0) != null ? ref25 : (ref28 = citation['journalInfo']) != null ? ref28[p.replace('journalInfo.', '')] : void 0) {
          if (typeof rt === 'number') {
            rt = rt.toString();
          }
          try {
            if (typeof rt !== 'string') {
              rt = rt['date-time'].toString();
            }
          } catch (error) {}
          if (typeof rt !== 'string') {
            try {
              for (k in rt['date-parts'][0]) {
                if ((ref29 = typeof rt['date-parts'][0][k]) !== 'number' && ref29 !== 'string') {
                  rt['date-parts'][0][k] = '01';
                }
              }
              rt = rt['date-parts'][0].join('-');
            } catch (error) {}
          }
          if (typeof rt === 'string') {
            res.published = rt.indexOf('T') !== -1 ? rt.split('T')[0] : rt;
            res.published = res.published.replace(/\//g, '-').replace(/-(\d)-/g, "-0$1-").replace(/-(\d)$/, "-0$1");
            if (res.published.indexOf('-') === -1) {
              res.published += '-01';
            }
            if (res.published.split('-').length !== 3) {
              res.published += '-01';
            }
            if (res.year == null) {
              res.year = res.published.split('-')[0];
            }
            if (res.published.split('-').length !== 3) {
              delete res.published;
            }
            if (res.year.length !== 4) {
              delete res.year;
            }
          }
        }
        if (res.published) {
          break;
        }
      }
    }
    if (citation.year) {
      if (res.year == null) {
        res.year = citation.year;
      }
    }
    try {
      if (res.year == null) {
        res.year = citation.journalInfo.yearOfPublication.trim();
      }
    } catch (error) {}
    if ((res.author == null) && ((citation.author != null) || (citation.z_authors != null) || ((ref30 = citation.authorList) != null ? ref30.author : void 0))) {
      if (res.author == null) {
        res.author = [];
      }
      try {
        ref33 = (ref31 = (ref32 = citation.author) != null ? ref32 : citation.z_authors) != null ? ref31 : citation.authorList.author;
        for (n = 0, len2 = ref33.length; n < len2; n++) {
          a = ref33[n];
          if (typeof a === 'string') {
            res.author.push({
              name: a
            });
          } else {
            au = {};
            au.given = (ref34 = a.given) != null ? ref34 : a.firstName;
            au.family = (ref35 = a.family) != null ? ref35 : a.lastName;
            au.name = (au.given ? au.given + ' ' : '') + ((ref36 = au.family) != null ? ref36 : '');
            if (a.affiliation != null) {
              try {
                ref37 = (au.affiliation ? (Array.isArray(a.affiliation) ? a.affiliation : [a.affiliation]) : au.authorAffiliationDetailsList.authorAffiliation);
                for (o = 0, len3 = ref37.length; o < len3; o++) {
                  aff = ref37[o];
                  if (typeof aff === 'string') {
                    if (au.affiliation == null) {
                      au.affiliation = [];
                    }
                    au.affiliation.push({
                      name: aff.replace(/\s\s+/g, ' ').trim()
                    });
                  } else if (typeof aff === 'object' && (aff.name || aff.affiliation)) {
                    if (au.affiliation == null) {
                      au.affiliation = [];
                    }
                    au.affiliation.push({
                      name: ((ref38 = aff.name) != null ? ref38 : aff.affiliation).replace(/\s\s+/g, ' ').trim()
                    });
                  }
                }
              } catch (error) {}
            }
            res.author.push(au);
          }
        }
      } catch (error) {}
    }
    try {
      if ((citation.subject != null) && citation.subject.length && typeof citation.subject[0] === 'string') {
        res.subject = citation.subject;
      }
    } catch (error) {}
    try {
      if ((((ref39 = citation.keywordList) != null ? ref39.keyword : void 0) != null) && citation.keywordList.keyword.length && typeof citation.keywordList.keyword[0] === 'string') {
        res.keyword = citation.keywordList.keyword;
      }
    } catch (error) {}
    try {
      ref44 = [...((ref40 = (ref41 = citation.meshHeadingList) != null ? ref41.meshHeading : void 0) != null ? ref40 : []), ...((ref42 = (ref43 = citation.chemicalList) != null ? ref43.chemical : void 0) != null ? ref42 : [])];
      for (q = 0, len4 = ref44.length; q < len4; q++) {
        m = ref44[q];
        if (res.keyword == null) {
          res.keyword = [];
        }
        mn = typeof m === 'string' ? m : (ref45 = m.name) != null ? ref45 : m.descriptorName;
        if (typeof mn === 'string' && mn && indexOf.call(res.keyword, mn) < 0) {
          res.keyword.push(mn);
        }
      }
    } catch (error) {}
    if (typeof citation.license === 'string') {
      res.licence = citation.license.trim().replace(/ /g, '-');
    }
    if (typeof citation.licence === 'string') {
      res.licence = citation.licence.trim().replace(/ /g, '-');
    }
    try {
      if (((ref46 = citation.best_oa_location) != null ? ref46.license : void 0) && ((ref47 = citation.best_oa_location) != null ? ref47.license : void 0) !== null) {
        if (res.licence == null) {
          res.licence = citation.best_oa_location.license;
        }
      }
    } catch (error) {}
    if (!res.licence) {
      if (Array.isArray(citation.assertion)) {
        ref48 = citation.assertion;
        for (r = 0, len5 = ref48.length; r < len5; r++) {
          a = ref48[r];
          if (a.label === 'OPEN ACCESS' && a.URL && a.URL.indexOf('creativecommons') !== -1) {
            if (res.licence == null) {
              res.licence = a.URL; // and if the record has a URL, it can be used as an open URL rather than a paywall URL, or the DOI can be used
            }
          }
        }
      }
      if (Array.isArray(citation.license)) {
        ref50 = (ref49 = citation.license) != null ? ref49 : [];
        for (s = 0, len6 = ref50.length; s < len6; s++) {
          l = ref50[s];
          if (l.URL && l.URL.indexOf('creativecommons') !== -1 && (!res.licence || res.licence.indexOf('creativecommons') === -1)) {
            if (res.licence == null) {
              res.licence = l.URL;
            }
          }
        }
      }
    }
    if (typeof res.licence === 'string' && res.licence.indexOf('/licenses/') !== -1) {
      res.licence = 'cc-' + res.licence.split('/licenses/')[1].replace(/$\//, '').replace(/\//g, '-').replace(/-$/, '');
    }
    // if there is a URL to use but not open, store it as res.paywall
    if (res.url == null) {
      res.url = (ref51 = (ref52 = citation.best_oa_location) != null ? ref52.url_for_pdf : void 0) != null ? ref51 : (ref53 = citation.best_oa_location) != null ? ref53.url : void 0; //? citation.url # is this always an open URL? check the sources, and check where else the open URL could be. Should it be blacklist checked and dereferenced?
    }
    if (!res.url && (((ref54 = citation.fullTextUrlList) != null ? ref54.fullTextUrl : void 0) != null)) { // epmc fulltexts
      ref55 = citation.fullTextUrlList.fullTextUrl;
      for (t = 0, len7 = ref55.length; t < len7; t++) {
        cf = ref55[t];
        if (((ref56 = cf.availabilityCode.toLowerCase()) === 'oa' || ref56 === 'f') && (!res.url || (cf.documentStyle === 'pdf' && res.url.indexOf('pdf') === -1))) {
          res.url = cf.url;
        }
      }
    }
  } else if (typeof citation === 'string') {
    try {
      citation = citation.replace(/citation\:/gi, '').trim();
      if (citation.indexOf('title') !== -1) {
        citation = citation.split('title')[1].trim();
      }
      citation = citation.replace(/^"/, '').replace(/^'/, '').replace(/"$/, '').replace(/'$/, '');
      if (citation.indexOf('doi:') !== -1) {
        res.doi = citation.split('doi:')[1].split(',')[0].split(' ')[0].trim();
      }
      if (citation.indexOf('doi.org/') !== -1) {
        res.doi = citation.split('doi.org/')[1].split(',')[0].split(' ')[0].trim();
      }
      if (!res.doi && citation.indexOf('http') !== -1) {
        res.url = 'http' + citation.split('http')[1].split(' ')[0].trim();
      }
      try {
        if (citation.indexOf('|') !== -1 || citation.indexOf('}') !== -1) {
          res.title = citation.split('|')[0].split('}')[0].trim();
        }
        if (citation.split('"').length > 2) {
          res.title = citation.split('"')[1].trim();
        } else if (citation.split("'").length > 2) {
          if (res.title == null) {
            res.title = citation.split("'")[1].trim();
          }
        }
      } catch (error) {}
      try {
        pts = citation.replace(/,\./g, ' ').split(' ');
        for (u = 0, len8 = pts.length; u < len8; u++) {
          pt = pts[u];
          if (!res.year) {
            pt = pt.replace(/[^0-9]/g, '');
            if (pt.length === 4) {
              sy = parseInt(pt);
              if (typeof sy === 'number' && !isNaN(sy)) {
                res.year = sy;
              }
            }
          }
        }
      } catch (error) {}
      try {
        if (!res.title && res.year && citation.indexOf(res.year) < (citation.length / 4)) {
          res.title = citation.split(res.year)[1].trim();
          if (res.title.indexOf('(') === -1 || res.title.indexOf(')') < res.title.indexOf('(')) {
            res.title = res.title.replace(')', '');
          }
          if (res.title.indexOf('.') < 3) {
            res.title = res.title.replace('.', '');
          }
          if (res.title.indexOf(',') < 3) {
            res.title = res.title.replace(',', '');
          }
          res.title = res.title.trim();
          if (res.title.indexOf('.') !== -1) {
            res.title = res.title.split('.')[0];
          } else if (res.title.indexOf(',') !== -1) {
            res.title = res.title.split(',')[0];
          }
        }
      } catch (error) {}
      if (res.title) {
        try {
          bt = citation.split(res.title)[0];
          if (res.year && bt.indexOf(res.year) !== -1) {
            bt = bt.split(res.year)[0];
          }
          if (res.url && bt.indexOf(res.url) > 0) {
            bt = bt.split(res.url)[0];
          }
          if (res.url && bt.indexOf(res.url) === 0) {
            bt = bt.replace(res.url);
          }
          if (res.doi && bt.indexOf(res.doi) === 0) {
            bt = bt.replace(res.doi);
          }
          if (bt.indexOf('.') < 3) {
            bt = bt.replace('.', '');
          }
          if (bt.indexOf(',') < 3) {
            bt = bt.replace(',', '');
          }
          if (bt.lastIndexOf('(') > (bt.length - 3)) {
            bt = bt.substring(0, bt.lastIndexOf('('));
          }
          if (bt.lastIndexOf(')') > (bt.length - 3)) {
            bt = bt.substring(0, bt.lastIndexOf(')'));
          }
          if (bt.lastIndexOf(',') > (bt.length - 3)) {
            bt = bt.substring(0, bt.lastIndexOf(','));
          }
          if (bt.lastIndexOf('.') > (bt.length - 3)) {
            bt = bt.substring(0, bt.lastIndexOf('.'));
          }
          bt = bt.trim();
          if (bt.length > 6) {
            if (bt.indexOf(',') !== -1) {
              res.author = [];
              ref57 = bt.split(',');
              for (v = 0, len9 = ref57.length; v < len9; v++) {
                ak = ref57[v];
                res.author.push({
                  name: ak
                });
              }
            } else {
              res.author = [
                {
                  name: bt
                }
              ];
            }
          }
        } catch (error) {}
        try {
          rmn = citation.split(res.title)[1];
          if (res.url && rmn.indexOf(res.url) !== -1) {
            rmn = rmn.replace(res.url);
          }
          if (res.doi && rmn.indexOf(res.doi) !== -1) {
            rmn = rmn.replace(res.doi);
          }
          if (rmn.indexOf('.') < 3) {
            rmn = rmn.replace('.', '');
          }
          if (rmn.indexOf(',') < 3) {
            rmn = rmn.replace(',', '');
          }
          rmn = rmn.trim();
          if (rmn.length > 6) {
            res.journal = rmn;
            if (rmn.indexOf(',') !== -1) {
              res.journal = res.journal.split(',')[0].replace(/in /gi, '').trim();
            }
            if (res.journal.indexOf('.') < 3) {
              res.journal = res.journal.replace('.', '');
            }
            if (res.journal.indexOf(',') < 3) {
              res.journal = res.journal.replace(',', '');
            }
            res.journal = res.journal.trim();
          }
        } catch (error) {}
      }
      try {
        if (res.journal) {
          rmn = citation.split(res.journal)[1];
          if (res.url && rmn.indexOf(res.url) !== -1) {
            rmn = rmn.replace(res.url);
          }
          if (res.doi && rmn.indexOf(res.doi) !== -1) {
            rmn = rmn.replace(res.doi);
          }
          if (rmn.indexOf('.') < 3) {
            rmn = rmn.replace('.', '');
          }
          if (rmn.indexOf(',') < 3) {
            rmn = rmn.replace(',', '');
          }
          rmn = rmn.trim();
          if (rmn.length > 4) {
            if (rmn.indexOf('retrieved') !== -1) {
              rmn = rmn.split('retrieved')[0];
            }
            if (rmn.indexOf('Retrieved') !== -1) {
              rmn = rmn.split('Retrieved')[0];
            }
            res.volume = rmn;
            if (res.volume.indexOf('(') !== -1) {
              res.volume = res.volume.split('(')[0];
              res.volume = res.volume.trim();
              try {
                res.issue = rmn.split('(')[1].split(')')[0];
                res.issue = res.issue.trim();
              } catch (error) {}
            }
            if (res.volume.indexOf(',') !== -1) {
              res.volume = res.volume.split(',')[0];
              res.volume = res.volume.trim();
              try {
                res.issue = rmn.split(',')[1];
                res.issue = res.issue.trim();
              } catch (error) {}
            }
            if (res.volume) {
              try {
                if (isNaN(parseInt(res.volume))) {
                  delete res.volume;
                }
              } catch (error) {}
            }
            if (res.issue) {
              if (res.issue.indexOf(',') !== -1) {
                res.issue = res.issue.split(',')[0].trim();
              }
              try {
                if (isNaN(parseInt(res.issue))) {
                  delete res.issue;
                }
              } catch (error) {}
            }
            if (res.volume && res.issue) {
              try {
                rmn = citation.split(res.journal)[1];
                if (rmn.indexOf('retriev') !== -1) {
                  rmn = rmn.split('retriev')[0];
                }
                if (rmn.indexOf('Retriev') !== -1) {
                  rmn = rmn.split('Retriev')[0];
                }
                if (res.url && rmn.indexOf(res.url) !== -1) {
                  rmn = rmn.split(res.url)[0];
                }
                if (res.doi && rmn.indexOf(res.doi) !== -1) {
                  rmn = rmn.split(res.doi)[0];
                }
                rmn = rmn.substring(rmn.indexOf(res.volume) + (res.volume + '').length);
                rmn = rmn.substring(rmn.indexOf(res.issue) + (res.issue + '').length);
                if (rmn.indexOf('.') < 2) {
                  rmn = rmn.replace('.', '');
                }
                if (rmn.indexOf(',') < 2) {
                  rmn = rmn.replace(',', '');
                }
                if (rmn.indexOf(')') < 2) {
                  rmn = rmn.replace(')', '');
                }
                rmn = rmn.trim();
                if (!isNaN(parseInt(rmn.substring(0, 1)))) {
                  res.pages = rmn.split(' ')[0].split('.')[0].trim();
                  if (res.pages.length > 5) {
                    res.pages = res.pages.split(', ')[0];
                  }
                }
              } catch (error) {}
            }
          }
        }
      } catch (error) {}
      if (!res.author && citation.indexOf('et al') !== -1) {
        cn = citation.split('et al')[0].trim();
        if (citation.indexOf(cn) === 0) {
          res.author = [
            {
              name: cn + 'et al'
            }
          ];
        }
      }
      if (res.title && !res.volume) {
        try {
          clc = citation.split(res.title)[1].toLowerCase().replace('volume', 'vol').replace('vol.', 'vol').replace('issue', 'iss').replace('iss.', 'iss').replace('pages', 'page').replace('pp', 'page');
          if (clc.indexOf('vol') !== -1) {
            res.volume = clc.split('vol')[1].split(',')[0].split('(')[0].split('.')[0].split(' ')[0].trim();
          }
          if (!res.issue && clc.indexOf('iss') !== -1) {
            res.issue = clc.split('iss')[1].split(',')[0].split('.')[0].split(' ')[0].trim();
          }
          if (!res.pages && clc.indexOf('page') !== -1) {
            res.pages = clc.split('page')[1].split('.')[0].split(', ')[0].split(' ')[0].trim();
          }
        } catch (error) {}
      }
    } catch (error) {}
  }
  return res;
};

// temporary legacy wrapper for old site front page availability check
// that page should be moved to use the new embed, like shareyourpaper
P.svc.oaworks.availability = async function(params, v2) {
  var afnd, base, qry, ref, ref1, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref18, ref19, ref2, ref20, ref21, ref3, ref4, ref5, ref6, ref7, ref8, ref9, request, resp, rq;
  if (params == null) {
    params = this.copy(this.params);
  }
  delete this.params.dom;
  if (params.availability) {
    if (params.availability.startsWith('10.') && params.availability.indexOf('/') !== -1) {
      params.doi = params.availability;
    } else if (params.availability.indexOf(' ') !== -1) {
      params.title = params.availability;
    } else {
      params.id = params.availability;
    }
    delete params.availability;
  }
  if (Array.isArray(params.url)) {
    params.url = params.url[0];
  }
  if (!params.test && params.url && false) { //await @svc.oaworks.blacklist params.url
    if (params.dom) {
      params.dom = 'redacted';
    }
    return {
      status: 400
    };
  } else {
    afnd = {
      data: {
        availability: [],
        requests: [],
        accepts: [],
        meta: {
          article: {},
          data: {}
        }
      }
    };
    if (params != null) {
      afnd.data.match = (ref = (ref1 = (ref2 = (ref3 = (ref4 = (ref5 = (ref6 = (ref7 = params.doi) != null ? ref7 : params.pmid) != null ? ref6 : params.pmc) != null ? ref5 : params.pmcid) != null ? ref4 : params.title) != null ? ref3 : params.url) != null ? ref2 : params.id) != null ? ref1 : params.citation) != null ? ref : params.q;
    }
    if (typeof v2 === 'object' && JSON.stringify(v2) !== '{}' && (v2.metadata != null)) {
      afnd.v2 = v2;
    }
    if (afnd.v2 == null) {
      afnd.v2 = (await this.svc.oaworks.find(params));
    }
    if (afnd.v2 != null) {
      if ((base = afnd.data).match == null) {
        base.match = (ref8 = (ref9 = (ref10 = (ref11 = (ref12 = (ref13 = afnd.v2.input) != null ? ref13 : (ref14 = afnd.v2.metadata) != null ? ref14.doi : void 0) != null ? ref12 : (ref15 = afnd.v2.metadata) != null ? ref15.title : void 0) != null ? ref11 : (ref16 = afnd.v2.metadata) != null ? ref16.pmid : void 0) != null ? ref10 : (ref17 = afnd.v2.metadata) != null ? ref17.pmc : void 0) != null ? ref9 : (ref18 = afnd.v2.metadata) != null ? ref18.pmcid : void 0) != null ? ref8 : (ref19 = afnd.v2.metadata) != null ? ref19.url : void 0;
      }
      if (Array.isArray(afnd.data.match)) {
        afnd.data.match = afnd.data.match[0];
      }
      try {
        afnd.data.ill = afnd.v2.ill;
        if (afnd.v2.metadata != null) {
          afnd.data.meta.article = JSON.parse(JSON.stringify(afnd.v2.metadata));
        }
        if (Array.isArray(afnd.data.meta.article.url)) {
          afnd.data.meta.article.url = afnd.data.meta.article.url[0];
        }
        if ((afnd.v2.url != null) && (afnd.data.meta.article.source == null)) {
          afnd.data.meta.article.source = 'oaworks'; // source doesn't play significant role any more, could prob just remove this if not used anywhere
        }
        if (afnd.v2.url) {
          afnd.data.availability.push({
            type: 'article',
            url: (Array.isArray(afnd.v2.url) ? afnd.v2.url[0] : afnd.v2.url)
          });
        }
      } catch (error) {}
      try {
        if (afnd.data.availability.length === 0 && (afnd.v2.metadata.doi || afnd.v2.metadata.title || afnd.v2.meadata.url)) {
          if (afnd.v2.metadata.doi) {
            qry = 'doi.exact:"' + afnd.v2.metadata.doi + '"';
          } else if (afnd.v2.metadata.title) {
            qry = 'title.exact:"' + afnd.v2.metadata.title + '"';
          } else {
            qry = 'url.exact:"' + (Array.isArray(afnd.v2.metadata.url) ? afnd.v2.metadata.url[0] : afnd.v2.metadata.url) + '"';
          }
          if (qry) {
            resp = (await this.fetch('https://' + (this.S.dev ? 'dev.' : '') + 'api.cottagelabs.com/service/oab/requests?q=' + qry + ' AND type:article&sort=createdAt:desc'));
            if (resp != null ? (ref20 = resp.hits) != null ? ref20.total : void 0 : void 0) {
              request = resp.hits.hits[0]._source;
              rq = {
                type: 'article',
                _id: request._id
              };
              rq.ucreated = params.uid && ((ref21 = request.user) != null ? ref21.id : void 0) === params.uid ? true : false;
              afnd.data.requests.push(rq);
            }
          }
        }
      } catch (error) {}
    }
    if (afnd.data.availability.length === 0 && afnd.data.requests.length === 0) {
      afnd.data.accepts.push({
        type: 'article'
      });
    }
    return afnd;
  }
};

P.svc.oaworks.availability._hidden = true;

// this should default to a search of ILLs as well... with a restrict
// restrict = @auth.role('openaccessbutton.admin', @user) and this.queryParams.all then [] else [{term:{from:@user?._id}}]
var indexOf = [].indexOf;

P.svc.oaworks.ill = async function(opts) { // only worked on POST with optional auth
  var a, atidy, ats, authors, config, first, i, j, len, len1, m, o, ordered, r, ref, ref1, ref2, ref3, ref4, su, tmpl, vars;
  if (opts == null) {
    opts = this.copy(this.params);
    if (opts.ill) {
      opts.doi = opts.ill;
      delete opts.ill;
    }
  }
  if (opts.metadata == null) {
    opts.metadata = (await this.svc.oaworks.metadata(opts));
  }
  if (opts.pilot === true) {
    opts.pilot = Date.now();
  }
  if (opts.live === true) {
    opts.live = Date.now();
  }
  config = opts.config;
  try {
    config = JSON.parse(config);
  } catch (error1) {}
  if (typeof config === 'string' || (!config && opts.from)) {
    config = (await this.fetch('https://api.cottagelabs.com/service/oab/ill/config?uid=' + ((ref = opts.from) != null ? ref : config)));
    if ((config == null) || JSON.stringify(config) === '{}') {
      config = (await this.fetch('https://dev.api.cottagelabs.com/service/oab/ill/config?uid=' + ((ref1 = opts.from) != null ? ref1 : config)));
    }
  }
  if (config == null) {
    config = {};
  }
  vars = {
    name: 'librarian',
    details: '' // anywhere to get the user name from config?
  };
  ordered = ['title', 'author', 'volume', 'issue', 'date', 'pages'];
  for (o in opts) {
    if (o === 'metadata') {
      for (m in opts[o]) {
        if (m !== 'email') {
          opts[m] = opts[o][m];
          if (indexOf.call(ordered, m) < 0) {
            ordered.push(m);
          }
        }
      }
      delete opts.metadata;
    } else {
      if (indexOf.call(ordered, o) < 0) {
        ordered.push(o);
      }
    }
  }
  for (i = 0, len = ordered.length; i < len; i++) {
    r = ordered[i];
    if (opts[r]) {
      vars[r] = opts[r];
      if (r === 'author') {
        authors = '<p>Authors:<br>';
        first = true;
        ats = [];
        ref2 = opts[r];
        for (j = 0, len1 = ref2.length; j < len1; j++) {
          a = ref2[j];
          if (a.family) {
            if (first) {
              first = false;
            } else {
              authors += ', ';
            }
            atidy = a.family + (a.given ? ' ' + a.given : '');
            authors += atidy;
            ats.push(atidy);
          }
        }
        vars[r] = ats;
      }
    }
  }
  if (opts.author != null) {
    delete opts.author; // remove author metadata due to messy provisions causing save issues
  }
  vars.illid = opts._id = (await this.uid());
  // such as https://ambslibrary.share.worldcat.org/wms/cmnd/nd/discover/items/search?ai0id=level3&ai0type=scope&offset=1&pageSize=10&si0in=in%3A&si0qs=0021-9231&si1in=au%3A&si1op=AND&si2in=kw%3A&si2op=AND&sortDirection=descending&sortKey=librarycount&applicationId=nd&requestType=search&searchType=advancedsearch&eventSource=df-advancedsearch
  // could be provided as: (unless other params are mandatory) 
  // https://ambslibrary.share.worldcat.org/wms/cmnd/nd/discover/items/search?si0qs=0021-9231
  if (config.search && config.search.length && (opts.issn || opts.journal)) {
    if (config.search.indexOf('worldcat') !== -1) {
      su = config.search.split('?')[0] + '?ai0id=level3&ai0type=scope&offset=1&pageSize=10&si0in=';
      su += opts.issn != null ? 'in%3A' : 'ti%3A';
      su += '&si0qs=' + ((ref3 = opts.issn) != null ? ref3 : opts.journal);
      su += '&sortDirection=descending&sortKey=librarycount&applicationId=nd&requestType=search&searchType=advancedsearch&eventSource=df-advancedsearch';
    } else {
      su = config.search;
      su += opts.issn ? opts.issn : opts.journal;
    }
    vars.worldcatsearchurl = su;
  }
  tmpl = (await this.svc.oaworks.templates('instantill_create.html'));
  tmpl = tmpl.content;
  if (!opts.forwarded && !opts.resolved && (config.email || opts.email)) {
    this.mail({
      svc: 'oaworks',
      vars: vars,
      template: tmpl,
      to: (ref4 = config.email) != null ? ref4 : opts.email,
      from: "InstantILL <InstantILL@openaccessbutton.org>",
      subject: "ILL request " + opts._id
    });
  }
  tmpl = tmpl.replace(/Dear.*?\,/, 'Dear Joe, here is a copy of what was just sent:');
  this.waitUntil(this.mail({
    svc: 'oaworks',
    vars: vars,
    template: tmpl,
    from: "InstantILL <InstantILL@openaccessbutton.org>",
    subject: "ILL CREATED " + opts._id,
    to: 'mark@cottagelabs.com' // ['joe@openaccessbutton.org']
  }));
  return opts;
};

//P.svc.oaworks.ill._kv = true
P.svc.oaworks.ill._index = true;

P.svc.oaworks.ill.collect = async function(params) {
  var q, sid, url;
  if (params == null) {
    params = this.copy(this.params);
  }
  sid = params.collect; // end of the url is an SID
  if (params._id == null) {
    params._id = (await this.uid());
  }
  // example AKfycbwPq7xWoTLwnqZHv7gJAwtsHRkreJ1hMJVeeplxDG_MipdIamU6
  url = 'https://script.google.com/macros/s/' + sid + '/exec?';
  for (q in params) {
    if (q !== 'collect') {
      url += (q === '_id' ? 'uuid' : q) + '=' + params[q] + '&';
    }
  }
  this.waitUntil(this.fetch(url));
  this.waitUntil(this.svc.rscvd(params));
  return true;
};

P.svc.oaworks.ill.openurl = async function(config, meta) {
  var author, d, defaults, i, k, len, nfield, ref, ref1, ref2, url, v;
  // Will eventually redirect after reading openurl params passed here, somehow. 
  // For now a POST of metadata here by a user with an open url registered will build their openurl
  if (config == null) {
    config = (ref = this.params.config) != null ? ref : {};
  }
  if (meta == null) {
    meta = (ref1 = this.params.meta) != null ? ref1 : (await this.svc.oaworks.metadata());
  }
  if (config.ill_redirect_base_url) {
    if (config.ill_form == null) {
      config.ill_form = config.ill_redirect_base_url;
    }
  }
  if (config.ill_redirect_params) {
    if (config.ill_added_params == null) {
      config.ill_added_params = config.ill_redirect_params;
    }
  }
  // add iupui / openURL defaults to config
  defaults = {
    sid: 'sid',
    title: 'atitle', // this is what iupui needs (title is also acceptable, but would clash with using title for journal title, which we set below, as iupui do that
    doi: 'rft_id', // don't know yet what this should be
    pmcid: 'pmcid', // don't know yet what this should be
    author: 'aulast', // author should actually be au, but aulast works even if contains the whole author, using aufirst just concatenates
    journal: 'title', // this is what iupui needs
    page: 'pages', // iupui uses the spage and epage for start and end pages, but pages is allowed in openurl, check if this will work for iupui
    published: 'date', // this is what iupui needs, but in format 1991-07-01 - date format may be a problem
    year: 'rft.year' // this is what IUPUI uses
  };
  for (d in defaults) {
    if (!config[d]) {
      config[d] = defaults[d];
    }
  }
  url = '';
  if (config.ill_added_params) {
    url += config.ill_added_params.replace('?', '') + '&';
  }
  url += config.sid + '=InstantILL&';
  for (k in meta) {
    v = '';
    if (k === 'author') {
      ref2 = (Array.isArray(meta.author) ? meta.author : [meta.author]);
      for (i = 0, len = ref2.length; i < len; i++) {
        author = ref2[i];
        if (v.length) {
          v += ', ';
        }
        v += typeof author === 'string' ? author : author.family ? author.family + (author.given ? ', ' + author.given : '') : JSON.stringify(author);
      }
    } else if (k === 'doi' || k === 'pmid' || k === 'pmc' || k === 'pmcid' || k === 'url' || k === 'journal' || k === 'title' || k === 'year' || k === 'issn' || k === 'volume' || k === 'issue' || k === 'page' || k === 'crossref_type' || k === 'publisher' || k === 'published' || k === 'notes') {
      v = meta[k];
    }
    if (v) {
      url += (config[k] ? config[k] : k) + '=' + encodeURIComponent(v) + '&';
    }
  }
  if (meta.usermetadata) {
    nfield = config.notes ? config.notes : 'notes';
    url = url.replace('usermetadata=true', '');
    if (url.indexOf(nfield + '=') === -1) {
      url += '&' + nfield + '=The user provided some metadata.';
    } else {
      url = url.replace(nfield + '=', nfield + '=The user provided some metadata. ');
    }
  }
  return url.replace('/&&/g', '&');
};

P.svc.oaworks.ill.subscription = async function(config, meta) {
  var err, error, fnd, npg, openurl, pg, ref, ref1, ref2, res, s, spg, sub, subtype, surl, tid, url;
  if (config == null) {
    config = (ref = this.params.config) != null ? ref : {};
  }
  if (typeof config === 'string') {
    config = (await this.fetch('https://api.cottagelabs.com/service/oab/ill/config?uid=' + config));
    if ((config == null) || JSON.stringify(config) === '{}') {
      config = (await this.fetch('https://dev.api.cottagelabs.com/service/oab/ill/config?uid=' + ((ref1 = opts.from) != null ? ref1 : config)));
    }
  }
  if (meta == null) {
    meta = this.params.meta;
  }
  res = {
    findings: {},
    lookups: [],
    error: [],
    contents: []
  };
  if (config.subscription != null) {
    if (config.ill_redirect_params) {
      if (config.ill_added_params == null) {
        config.ill_added_params = config.ill_redirect_params;
      }
    }
    // need to get their subscriptions link from their config - and need to know how to build the query string for it
    openurl = (await this.svc.oaworks.ill.openurl(config, meta));
    if (config.ill_added_params) {
      openurl = openurl.replace(config.ill_added_params.replace('?', ''), '');
    }
    if (typeof config.subscription === 'string') {
      config.subscription = config.subscription.split(',');
    }
    if (typeof config.subscription_type === 'string') {
      config.subscription_type = config.subscription_type.split(',');
    }
    if (config.subscription_type == null) {
      config.subscription_type = [];
    }
    for (s in config.subscription) {
      sub = config.subscription[s];
      if (typeof sub === 'object') {
        subtype = sub.type;
        sub = sub.url;
      } else {
        subtype = (ref2 = config.subscription_type[s]) != null ? ref2 : 'unknown';
      }
      sub = sub.trim();
      if (sub) {
        if (subtype === 'serialssolutions' || sub.indexOf('serialssolutions') !== -1) { //  and sub.indexOf('.xml.') is -1
          tid = sub.split('.search')[0];
          if (tid.indexOf('//') !== -1) {
            tid = tid.split('//')[1];
          }
          //bs = if sub.indexOf('://') isnt -1 then sub.split('://')[0] else 'http' # always use http because https on the xml endpoint fails
          sub = 'http://' + tid + '.openurl.xml.serialssolutions.com/openurlxml?version=1.0&genre=article&';
        } else if ((subtype === 'sfx' || sub.indexOf('sfx.') !== -1) && sub.indexOf('sfx.response_type=simplexml') === -1) {
          sub += (sub.indexOf('?') === -1 ? '?' : '&') + 'sfx.response_type=simplexml';
        } else if ((subtype === 'exlibris' || sub.indexOf('.exlibris') !== -1) && sub.indexOf('response_type') === -1) {
          // https://github.com/OAButton/discussion/issues/1793
          //sub = 'https://trails-msu.userservices.exlibrisgroup.com/view/uresolver/01TRAILS_MSU/openurl?svc_dat=CTO&response_type=xml&sid=InstantILL&'
          sub = sub.split('?')[0] + '?svc_dat=CTO&response_type=xml&sid=InstantILL&';
        }
        //ID=doi:10.1108%2FNFS-09-2019-0293&genre=article&atitle=Impact%20of%20processing%20and%20packaging%20on%20the%20quality%20of%20murici%20jelly%20%5BByrsonima%20crassifolia%20(L.)%20rich%5D%20during%20storage.&title=Nutrition%20&%20Food%20Science&issn=00346659&volume=50&issue=5&date=20200901&au=Da%20Cunha,%20Mariana%20Crivelari&spage=871&pages=871-883
        url = sub + (sub.indexOf('?') === -1 ? '?' : '&') + openurl;
        if (url.indexOf('snc.idm.oclc.org/login?url=') !== -1) {
          url = url.split('snc.idm.oclc.org/login?url=')[1];
        }
        url = url.replace('cache=true', '');
        if (subtype === 'sfx' || sub.indexOf('sfx.') !== -1 && url.indexOf('=10.') !== -1) {
          url = url.replace('=10.', '=doi:10.');
        }
        if (subtype === 'exlibris' || sub.indexOf('.exlibris') !== -1 && url.indexOf('doi=10.') !== -1) {
          url = url.replace('doi=10.', 'ID=doi:10.');
        }
        pg = '';
        spg = '';
        error = false;
        res.lookups.push(url);
        try {
          // proxy may still be required if our main machine was registered with some of these ILL service providers...
          pg = url.indexOf('.xml.serialssolutions') !== -1 || url.indexOf('sfx.response_type=simplexml') !== -1 || url.indexOf('response_type=xml') !== -1 ? (await this.fetch(url)) : (await this.puppet(url));
          spg = pg.indexOf('<body') !== -1 ? pg.toLowerCase().split('<body')[1].split('</body')[0] : pg;
          res.contents.push(spg);
        } catch (error1) {
          err = error1;
          error = true;
        }
        // sfx 
        // with access:
        // https://cricksfx.hosted.exlibrisgroup.com/crick?sid=Elsevier:Scopus&_service_type=getFullTxt&issn=00225193&isbn=&volume=467&issue=&spage=7&epage=14&pages=7-14&artnum=&date=2019&id=doi:10.1016%2fj.jtbi.2019.01.031&title=Journal+of+Theoretical+Biology&atitle=Potential+relations+between+post-spliced+introns+and+mature+mRNAs+in+the+Caenorhabditis+elegans+genome&aufirst=S.&auinit=S.&auinit1=S&aulast=Bo
        // which will contain a link like:
        // <A title="Navigate to target in new window" HREF="javascript:openSFXMenuLink(this, 'basic1', undefined, '_blank');">Go to Journal website at</A>
        // but the content can be different on different sfx language pages, so need to find this link via the tag attributes, then trigger it, then get the page it opens
        // can test this with 10.1016/j.jtbi.2019.01.031 on instantill page
        // note there is also now an sfx xml endpoint that we have found to check
        if (subtype === 'sfx' || url.indexOf('sfx.') !== -1) {
          if (error) {
            res.error.push('sfx');
          }
          if (spg.indexOf('getFullTxt') !== -1 && spg.indexOf('<target_url>') !== -1) {
            try {
              // this will get the first target that has a getFullTxt type and has a target_url element with a value in it, or will error
              res.url = spg.split('getFullTxt')[1].split('</target>')[0].split('<target_url>')[1].split('</target_url>')[0].trim();
              res.findings.sfx = res.url;
              if (res.url != null) {
                if (res.url.indexOf('getitnow') === -1) {
                  res.found = 'sfx';
                  return res;
                } else {
                  res.url = void 0;
                  res.findings.sfx = void 0;
                }
              }
            } catch (error1) {}
          } else {
            if (spg.indexOf('<a title="navigate to target in new window') !== -1 && spg.split('<a title="navigate to target in new window')[1].split('">')[0].indexOf('basic1') !== -1) {
              // tried to get the next link after the click through, but was not worth putting more time into it. For now, seems like this will have to do
              res.url = url;
              res.findings.sfx = res.url;
              if (res.url != null) {
                if (res.url.indexOf('getitnow') === -1) {
                  res.found = 'sfx';
                  return res;
                } else {
                  res.url = void 0;
                  res.findings.sfx = void 0;
                }
              }
            }
          }
        // eds
        // note eds does need a login, but IP address range is supposed to get round that
        // our IP is supposed to be registered with the library as being one of their internal ones so should not need login
        // however a curl from our IP to it still does not seem to work - will try with puppeteer to see if it is blocking in other ways
        // not sure why the links here are via an oclc login - tested, and we will use without it
        // with access:
        // https://snc.idm.oclc.org/login?url=http://resolver.ebscohost.com/openurl?sid=google&auinit=RE&aulast=Marx&atitle=Platelet-rich+plasma:+growth+factor+enhancement+for+bone+grafts&id=doi:10.1016/S1079-2104(98)90029-4&title=Oral+Surgery,+Oral+Medicine,+Oral+Pathology,+Oral+Radiology,+and+Endodontology&volume=85&issue=6&date=1998&spage=638&issn=1079-2104
        // can be tested on instantill page with 10.1016/S1079-2104(98)90029-4
        // without:
        // https://snc.idm.oclc.org/login?url=http://resolver.ebscohost.com/openurl?sid=google&auinit=MP&aulast=Newton&atitle=Librarian+roles+in+institutional+repository+data+set+collecting:+outcomes+of+a+research+library+task+force&id=doi:10.1080/01462679.2011.530546
        } else if (subtype === 'eds' || url.indexOf('ebscohost.') !== -1) {
          if (error) {
            res.error.push('eds');
          }
          if (spg.indexOf('view this ') !== -1 && pg.indexOf('<a data-auto="menu-link" href="') !== -1) {
            res.url = url.replace('://', '______').split('/')[0].replace('______', '://') + pg.split('<a data-auto="menu-link" href="')[1].split('" title="')[0];
            res.findings.eds = res.url;
            if (res.url != null) {
              if (res.url.indexOf('getitnow') === -1) {
                res.found = 'eds';
                return res;
              } else {
                res.url = void 0;
              }
            }
          }
        // serials solutions
        // the HTML source code for the No Results page includes a span element with the class SS_NoResults. This class is only found on the No Results page (confirmed by serialssolutions)
        // with:
        // https://rx8kl6yf4x.search.serialssolutions.com/?genre=article&issn=14085348&title=Annales%3A%20Series%20Historia%20et%20Sociologia&volume=28&issue=1&date=20180101&atitle=HOW%20TO%20UNDERSTAND%20THE%20WAR%20IN%20SYRIA.&spage=13&PAGES=13-28&AUTHOR=%C5%A0TERBENC%2C%20Primo%C5%BE&&aufirst=&aulast=&sid=EBSCO:aph&pid=
        // can test this on instantill page with How to understand the war in Syria - Annales Series Historia et Sociologia 2018
        // but the with link has a suppressed link that has to be clicked to get the actual page with the content on it
        // <a href="?ShowSupressedLinks=yes&SS_LibHash=RX8KL6YF4X&url_ver=Z39.88-2004&rfr_id=info:sid/sersol:RefinerQuery&rft_val_fmt=info:ofi/fmt:kev:mtx:journal&SS_ReferentFormat=JournalFormat&SS_formatselector=radio&rft.genre=article&SS_genreselector=1&rft.aulast=%C5%A0TERBENC&rft.aufirst=Primo%C5%BE&rft.date=2018-01-01&rft.issue=1&rft.volume=28&rft.atitle=HOW+TO+UNDERSTAND+THE+WAR+IN+SYRIA.&rft.spage=13&rft.title=Annales%3A+Series+Historia+et+Sociologia&rft.issn=1408-5348&SS_issnh=1408-5348&rft.isbn=&SS_isbnh=&rft.au=%C5%A0TERBENC%2C+Primo%C5%BE&rft.pub=Zgodovinsko+dru%C5%A1tvo+za+ju%C5%BEno+Primorsko&paramdict=en-US&SS_PostParamDict=disableOneClick">Click here</a>
        // which is the only link with the showsuppressedlinks param and the clickhere content
        // then the page with the content link is like:
        // https://rx8kl6yf4x.search.serialssolutions.com/?ShowSupressedLinks=yes&SS_LibHash=RX8KL6YF4X&url_ver=Z39.88-2004&rfr_id=info:sid/sersol:RefinerQuery&rft_val_fmt=info:ofi/fmt:kev:mtx:journal&SS_ReferentFormat=JournalFormat&SS_formatselector=radio&rft.genre=article&SS_genreselector=1&rft.aulast=%C5%A0TERBENC&rft.aufirst=Primo%C5%BE&rft.date=2018-01-01&rft.issue=1&rft.volume=28&rft.atitle=HOW+TO+UNDERSTAND+THE+WAR+IN+SYRIA.&rft.spage=13&rft.title=Annales%3A+Series+Historia+et+Sociologia&rft.issn=1408-5348&SS_issnh=1408-5348&rft.isbn=&SS_isbnh=&rft.au=%C5%A0TERBENC%2C+Primo%C5%BE&rft.pub=Zgodovinsko+dru%C5%A1tvo+za+ju%C5%BEno+Primorsko&paramdict=en-US&SS_PostParamDict=disableOneClick
        // and the content is found in a link like this:
        // <div id="ArticleCL" class="cl">
        //   <a target="_blank" href="./log?L=RX8KL6YF4X&amp;D=EAP&amp;J=TC0000940997&amp;P=Link&amp;PT=EZProxy&amp;A=HOW+TO+UNDERSTAND+THE+WAR+IN+SYRIA.&amp;H=c7306f7121&amp;U=http%3A%2F%2Fwww.ulib.iupui.edu%2Fcgi-bin%2Fproxy.pl%3Furl%3Dhttp%3A%2F%2Fopenurl.ebscohost.com%2Flinksvc%2Flinking.aspx%3Fgenre%3Darticle%26issn%3D1408-5348%26title%3DAnnales%2BSeries%2Bhistoria%2Bet%2Bsociologia%26date%3D2018%26volume%3D28%26issue%3D1%26spage%3D13%26atitle%3DHOW%2BTO%2BUNDERSTAND%2BTHE%2BWAR%2BIN%2BSYRIA.%26aulast%3D%25C5%25A0TERBENC%26aufirst%3DPrimo%C5%BE">Article</a>
        // </div>
        // without:
        // https://rx8kl6yf4x.search.serialssolutions.com/directLink?&atitle=Writing+at+the+Speed+of+Sound%3A+Music+Stenography+and+Recording+beyond+the+Phonograph&author=Pierce%2C+J+Mackenzie&issn=01482076&title=Nineteenth+Century+Music&volume=41&issue=2&date=2017-10-01&spage=121&id=doi:&sid=ProQ_ss&genre=article
        // we also have an xml alternative for serials solutions
        // see https://journal.code4lib.org/articles/108
        } else if (subtype === 'serialssolutions' || url.indexOf('serialssolutions.') !== -1) {
          if (error) {
            res.error.push('serialssolutions');
          }
          if (spg.indexOf('<ssopenurl:url type="article">') !== -1) {
            fnd = spg.split('<ssopenurl:url type="article">')[1].split('</ssopenurl:url>')[0].trim(); // this gets us something that has an empty accountid param - do we need that for it to work?
            if (fnd.length) {
              res.url = fnd;
              res.findings.serials = res.url;
              if (res.url != null) {
                if (res.url.indexOf('getitnow') === -1) {
                  res.found = 'serials';
                  return res;
                } else {
                  res.url = void 0;
                  res.findings.serials = void 0;
                }
              }
            }
          } else {
            // disable journal matching for now until we have time to get it more accurate - some things get journal links but are not subscribed
            //else if spg.indexOf('<ssopenurl:result format="journal">') isnt -1
            //  # we assume if there is a journal result but not a URL that it means the institution has a journal subscription but we don't have a link
            //  res.journal = true
            //  res.found = 'serials'
            //  return res
            if (spg.indexOf('ss_noresults') === -1) {
              try {
                surl = url.split('?')[0] + '?ShowSupressedLinks' + pg.split('?ShowSupressedLinks')[1].split('">')[0];
                npg = (await this.puppet(surl)); // would this still need proxy?
                if (npg.indexOf('ArticleCL') !== -1 && npg.split('DatabaseCL')[0].indexOf('href="./log') !== -1) {
                  res.url = surl.split('?')[0] + npg.split('ArticleCL')[1].split('DatabaseCL')[0].split('href="')[1].split('">')[0];
                  res.findings.serials = res.url;
                  if (res.url != null) {
                    if (res.url.indexOf('getitnow') === -1) {
                      res.found = 'serials';
                      return res;
                    } else {
                      res.url = void 0;
                      res.findings.serials = void 0;
                    }
                  }
                }
              } catch (error1) {
                if (error) {
                  res.error.push('serialssolutions');
                }
              }
            }
          }
        } else if (subtype === 'exlibris' || url.indexOf('.exlibris') !== -1) {
          if (error) {
            res.error.push('exlibris');
          }
          if (spg.indexOf('full_text_indicator') !== -1 && spg.split('full_text_indicator')[1].replace('">', '').indexOf('true') === 0 && spg.indexOf('resolution_url') !== -1) {
            res.url = spg.split('<resolution_url>')[1].split('</resolution_url>')[0].replace(/&amp;/g, '&');
            res.findings.exlibris = res.url;
            res.found = 'exlibris';
            return res;
          }
        }
      }
    }
  }
  return res;
};

P.svc.oaworks.journal = async function(q) {
  var ref, res;
  try {
    if ((q == null) && this.params.journal || this.params.issn) {
      q = '"' + ((ref = this.params.journal) != null ? ref : this.params.issn) + '"';
    }
  } catch (error) {}
  try {
    // search the old journal index endpoint until this gets updated
    //crj = await @src.crossref.journals q
    //drj = await @src.doaj.journals q
    res = (await this.fetch('https://dev.api.cottagelabs.com/service/jct/journal?q=' + q));
    return res.hits.hits[0]._source;
  } catch (error) {
    return void 0;
  }
};

P.svc.oaworks.journal.oa = async function(issn) {
  var oac, ref, ref1, tc;
  try {
    // NOTE it is still to be decided what licence is acceptable to be counted as OA on the crossref index. For now it's anything CC, including NC
    if (issn == null) {
      issn = (ref = (ref1 = this.params.journal) != null ? ref1 : this.params.issn) != null ? ref : this.params.oa;
    }
  } catch (error) {}
  tc = (await this.fetch('https://dev.api.cottagelabs.com/use/crossref/works?q=ISSN.exact:"' + issn + '"'));
  oac = (await this.fetch('https://dev.api.cottagelabs.com/use/crossref/works?q=ISSN.exact:"' + issn + '" AND is_oa:true')); // could add AND NOT licence:nc
  return tc.hits.total === oac.hits.total && (tc.hits.total !== 0 || oac.hits.total !== 0);
};

P.svc.oaworks.publisher = {};

P.svc.oaworks.publisher.oa = async function(publisher) {
  var oac, ref, tc;
  try {
    if (publisher == null) {
      publisher = (ref = this.params.publisher) != null ? ref : this.params.oa;
    }
  } catch (error) {}
  tc = (await this.fetch('https://dev.api.cottagelabs.com/service/jct/journal?q=publisher:"' + publisher + '" AND NOT discontinued:true'));
  oac = (await this.fetch('https://dev.api.cottagelabs.com/service/jct/journal?q=publisher:"' + publisher + '" AND NOT discontinued:true AND indoaj:true'));
  return tc.hits.total === oac.hits.total && (tc.hits.total !== 0 || oac.hits.total !== 0);
};

var indexOf = [].indexOf;

P.svc.oaworks.permissions = async function(meta, ror, getmeta) {
  var _getmeta, _prep, _score, af, altoa, an, cr, cwd, doa, fz, haddoi, i, inisn, issns, j, key, l, len, len1, len10, len11, len12, len2, len3, len4, len5, len6, len7, len8, len9, longest, lvs, m, msgs, n, o, oadoi, overall_policy_restriction, p, pb, perms, pisoa, ps, q, qr, r, ref, ref1, ref10, ref11, ref12, ref13, ref14, ref15, ref16, ref17, ref18, ref19, ref2, ref20, ref21, ref22, ref23, ref24, ref25, ref26, ref27, ref28, ref29, ref3, ref30, ref31, ref32, ref4, ref5, ref6, ref7, ref8, ref9, ro, rors, rp, rr, rs, rw, rwd, sn, snak, snkd, t, tr, u, v, vl, w, wp, x, y;
  overall_policy_restriction = false;
  cr = false;
  haddoi = false;
  _prep = async function(rec) {
    var a, d, em, eph, fst, i, j, len, len1, len2, m, ph, pt, ref, ref1, ref10, ref11, ref12, ref13, ref14, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, swaps;
    if (haddoi && rec.embargo_months && (meta.published || meta.year)) {
      em = new Date(Date.parse((ref = meta.published) != null ? ref : meta.year + '-01-01'));
      em = new Date(em.setMonth(em.getMonth() + rec.embargo_months));
      rec.embargo_end = em.toISOString().split('T')[0];
    }
    if (rec.embargo_end === '') {
      delete rec.embargo_end;
    }
    rec.copyright_name = rec.copyright_owner === 'publisher' ? (typeof rec.issuer.parent_policy === 'string' ? rec.issuer.parent_policy : typeof rec.issuer.id === 'string' ? rec.issuer.id : rec.issuer.id[0]) : (ref1 = rec.copyright_owner) === 'journal' || ref1 === 'affiliation' ? (ref2 = meta.journal) != null ? ref2 : '' : (haddoi && rec.copyright_owner && rec.copyright_owner.toLowerCase().indexOf('author') !== -1) && (meta.author != null) && meta.author.length && (meta.author[0].name || meta.author[0].family) ? ((ref3 = meta.author[0].name) != null ? ref3 : meta.author[0].family) + (meta.author.length > 1 ? ' et al' : '') : '';
    if (((ref4 = rec.copyright_name) === 'publisher' || ref4 === 'journal') && (cr || meta.doi || ((ref5 = rec.provenance) != null ? ref5.example : void 0))) {
      if (cr === false) {
        cr = (await this.src.crossref.works((ref6 = meta.doi) != null ? ref6 : rec.provenance.example));
      }
      if (((cr != null ? cr.assertion : void 0) != null) && cr.assertion.length) {
        ref7 = cr.assertion;
        for (i = 0, len = ref7.length; i < len; i++) {
          a = ref7[i];
          if (a.name.toLowerCase() === 'copyright') {
            try {
              rec.copyright_name = a.value;
            } catch (error) {}
            try {
              rec.copyright_name = a.value.replace('\u00a9 ', '').replace(/[0-9]/g, '').trim();
            } catch (error) {}
          }
        }
      }
    }
    if (haddoi && rec.copyright_year === '' && meta.year) {
      rec.copyright_year = meta.year;
    }
    if (rec.copyright_year === '') {
      delete rec.copyright_year;
    }
    if (haddoi && (rec.deposit_statement != null) && rec.deposit_statement.indexOf('<<') !== -1) {
      fst = '';
      ref8 = rec.deposit_statement.split('<<');
      for (j = 0, len1 = ref8.length; j < len1; j++) {
        pt = ref8[j];
        if (fst === '' && pt.indexOf('>>') === -1) {
          fst += pt;
        } else {
          eph = pt.split('>>');
          ph = eph[0].toLowerCase();
          swaps = {
            'journal title': 'journal',
            'vol': 'volume',
            'date of publication': 'published',
            '(c)': 'year',
            'article title': 'title',
            'copyright name': 'copyright_name'
          };
          if (swaps[ph] != null) {
            ph = swaps[ph];
          }
          if (ph === 'author') {
            try {
              fst += ((ref9 = meta.author[0].name) != null ? ref9 : meta.author[0].family) + (meta.author.length > 1 ? ' et al' : '');
            } catch (error) {}
          } else {
            fst += (ref10 = (ref11 = meta[ph]) != null ? ref11 : rec[ph]) != null ? ref10 : '';
          }
          try {
            fst += eph[1];
          } catch (error) {}
        }
      }
      rec.deposit_statement = fst;
    }
    if (rec._id != null) {
      if (rec.meta == null) {
        rec.meta = {};
      }
      rec.meta.source = 'https://' + (S.dev ? 'dev.api.cottagelabs.com/svc/oaworks/permissions/' : 'api.openaccessbutton.org/permissions/') + (rec.issuer.type ? rec.issuer.type + '/' : '') + rec._id;
    }
    if (typeof ((ref12 = rec.issuer) != null ? ref12.has_policy : void 0) === 'string' && ((ref13 = rec.issuer.has_policy.toLowerCase().trim()) === 'not publisher' || ref13 === 'takedown')) {
      // find out if this should be enacted if it is the case for any permission, or only the best permission
      overall_policy_restriction = rec.issuer.has_policy;
    }
    ref14 = ['_id', 'permission_required', 'createdAt', 'updatedAt', 'created_date', 'updated_date'];
    for (m = 0, len2 = ref14.length; m < len2; m++) {
      d = ref14[m];
      delete rec[d];
    }
    try {
      delete rec.issuer.updatedAt;
    } catch (error) {}
    return rec;
  };
  _score = (rec) => {
    var ref, ref1, ref2, ref3, ref4, ref5, score;
    score = rec.can_archive ? 1000 : 0;
    if (((ref = rec.provenance) != null ? ref.oa_evidence : void 0) === 'In DOAJ') {
      score += 1000;
    }
    if (rec.requirements != null) {
      // TODO what about cases where the requirement is met?
      // and HOW is requirement met? we search ROR against issuer, but how does that match with author affiliation?
      // should we even be searching for permissions by ROR, or only using it to calculate the ones we find by some other means?
      // and if it is not met then is can_archive worth anything?
      score -= 10;
    } else {
      score += rec.version === 'publishedVersion' ? 200 : rec.version === 'acceptedVersion' ? 100 : 0;
    }
    if ((rec.licences != null) && rec.licences.length) {
      score -= 5;
    }
    score += ((ref1 = rec.issuer) != null ? ref1.type : void 0) === 'journal' ? 5 : ((ref2 = rec.issuer) != null ? ref2.type : void 0) === 'publisher' ? 4 : ((ref3 = rec.issuer) != null ? ref3.type : void 0) === 'university' ? 3 : (ref4 = (ref5 = rec.issuer) != null ? ref5.type : void 0, indexOf.call('article', ref4) >= 0) ? 2 : 0;
    if (rec.embargo_months && rec.embargo_months >= 36 && (!rec.embargo_end || Date.parse(rec.embargo_end) < Date.now())) {
      score -= 25;
    }
    return score;
  };
  if (typeof meta === 'string') {
    meta = meta.indexOf('10.') === 0 ? {
      doi: meta
    } : {
      issn: meta
    };
  }
  if (meta == null) {
    meta = this.copy(this.params);
  }
  if ((meta != null ? meta.metadata : void 0) === true) { // just a pass-through for us to show metadata for debug
    delete meta.metadata;
  }
  if ((meta != null ? meta.permissions : void 0) != null) {
    if (meta.permissions.startsWith('journal/')) {
      meta.issn = meta.permissions.replace('journal/', '');
    } else if (meta.permissions.startsWith('affiliation/')) {
      meta.ror = meta.permissions.replace('affiliation/', '');
    } else if (meta.permissions.startsWith('publisher/')) {
      meta.publisher = meta.permissions.replace('publisher/', '');
    } else if (meta.permissions.indexOf('10.') === 0 && meta.permissions.indexOf('/') !== -1) {
      meta.doi = meta.permissions;
    } else if (meta.permissions.indexOf('-') !== -1 && meta.permissions.length < 10 && meta.permissions.length > 6) {
      meta.issn = meta.permissions;
    } else if (meta.permissions.indexOf(' ') === -1 && meta.permissions.indexOf(',') === -1 && meta.permissions.replace(/[0-9]/g, '').length !== meta.permissions.length) {
      meta.ror = meta.permissions;
    } else {
      meta.publisher = meta.permissions; // but could be a ROR?
    }
    delete meta.permissions;
  }
  if (meta.affiliation) {
    meta.ror = meta.affiliation;
    delete meta.affiliation;
  }
  if (meta.ror == null) {
    meta.ror = ror;
  }
  if (typeof meta.ror === 'string' && meta.ror.indexOf(',') !== -1) {
    meta.ror = meta.ror.split(',');
  }
  if (meta.journal && meta.journal.indexOf(' ') === -1 && meta.journal.indexOf('-') !== -1) {
    meta.issn = meta.journal;
    delete meta.journal;
  }
  issns = Array.isArray(meta.issn) ? meta.issn : []; // only if directly passed a list of ISSNs for the same article, accept them as the ISSNs list to use
  if (typeof meta.issn === 'string' && meta.issn.indexOf(',') !== -1) {
    meta.issn = meta.issn.split(',');
  }
  if (JSON.stringify(meta) === '{}' || (meta.issn && JSON.stringify(meta.issn).indexOf('-') === -1) || (meta.doi && (typeof meta.doi !== 'string' || meta.doi.indexOf('10.') !== 0 || meta.doi.indexOf('/') === -1))) {
    return {
      body: 'No valid DOI, ISSN, or ROR provided',
      status: 404
    };
  }
  
  // NOTE later will want to find affiliations related to the authors of the paper, but for now only act on affiliation provided as a ror
  // we now always try to get the metadata because joe wants to serve a 501 if the doi is not a journal article
  _getmeta = async() => {
    var mk, psm, results, rsm;
    psm = this.copy(meta);
    if (JSON.stringify(psm) !== '{}') {
      rsm = (await this.svc.oaworks.metadata(meta.doi));
      results = [];
      for (mk in rsm) {
        results.push(meta[mk] != null ? meta[mk] : meta[mk] = rsm[mk]);
      }
      return results;
    }
  };
  if (getmeta !== false && meta.doi && (!meta.publisher || !meta.issn)) {
    await _getmeta();
  }
  if (!meta.published && meta.year) {
    meta.published = meta.year + '-01-01';
  }
  haddoi = meta.doi != null;
  if (meta.issn) {
    if (typeof meta.issn === 'string') {
      meta.issn = [meta.issn];
    }
    if (!issns.length) { // they're already meta.issn in this case anyway
      ref = meta.issn;
      for (i = 0, len = ref.length; i < len; i++) {
        inisn = ref[i];
        if (indexOf.call(issns, inisn) < 0) { // check just in case
          issns.push(inisn);
        }
      }
    }
    if (!issns.length || !meta.publisher || !meta.doi) {
      if (af = (await this.svc.oaworks.journal('issn.exact:"' + issns.join('" OR issn.exact:"') + '"'))) {
        if (meta.doi == null) {
          meta.doi = af.doi;
        }
      }
    }
    try {
      if (meta.doi == null) {
        meta.doi = (await this.src.crossref.journals.doi(issns));
      }
    } catch (error) {}
    if (!haddoi && meta.doi) {
      await _getmeta();
      try {
        if (meta.publisher == null) {
          meta.publisher = af != null ? af.publisher : void 0;
        }
        if (af != null ? af.issn : void 0) {
          ref1 = (typeof af.issn === 'string' ? [af.issn] : af.issn);
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            an = ref1[j];
            if (indexOf.call(issns, an) < 0) { // check again
              issns.push(an);
            }
          }
        }
      } catch (error) {}
    }
  }
  if (haddoi && ((ref2 = meta.type) !== 'journal-article')) {
    return {
      body: 'DOI is not a journal article',
      status: 501
    };
  }
  if (meta.publisher && meta.publisher.indexOf('(') !== -1 && meta.publisher.lastIndexOf(')') > (meta.publisher.length * .7)) {
    // could be a publisher name with the acronym at the end, like Public Library of Science (PLoS)
    // so get rid of the acronym because that is not included in the publisher name in crossref and other sources
    meta.publisher = meta.publisher.substring(0, meta.publisher.lastIndexOf('(')).trim();
  }
  try {
    meta.citation = '[';
    if (meta.title) {
      meta.citation += meta.title + '. ';
    }
    if (meta.journal) {
      meta.citation += meta.journal + ' ';
    }
    if (meta.volume) {
      meta.citation += meta.volume + (meta.issue ? ', ' : ' ');
    }
    if (meta.issue) {
      meta.citation += meta.issue + ' ';
    }
    if ((meta.page != null) || (meta.pages != null)) {
      meta.citation += 'p' + ((ref3 = meta.page) != null ? ref3 : meta.pages);
    }
    if (meta.year || meta.published) {
      meta.citation += ' (' + ((ref4 = meta.year) != null ? ref4 : meta.published).split('-')[0] + ')';
    }
    meta.citation = meta.citation.trim();
    meta.citation += ']';
  } catch (error) {}
  perms = {
    best_permission: void 0,
    all_permissions: []
  };
  rors = [];
  if (meta.ror != null) {
    if (typeof meta.ror === 'string') {
      meta.ror = [meta.ror];
    }
    rs = (await this.svc.oaworks.permissions.affiliations('issuer.id:"' + meta.ror.join('" OR issuer.id:"') + '"'));
    if (!(rs != null ? (ref5 = rs.hits) != null ? ref5.total : void 0 : void 0)) {
      // look up the ROR in wikidata - if found, get the qid from the P17 country snak, look up that country qid
      // get the P297 ISO 3166-1 alpha-2 code, search affiliations for that
      if (rw = (await this.src.wikidata('snaks.property.exact:"P6782" AND snaks.property.exact:"P17" AND (snaks.value.exact:"' + meta.ror.join(" OR snaks.value.exact:") + '")'))) {
        snkd = false;
        ref8 = (ref6 = (ref7 = rw.hits) != null ? ref7.hits : void 0) != null ? ref6 : [];
        for (m = 0, len2 = ref8.length; m < len2; m++) {
          ro = ref8[m];
          if (snkd) {
            break;
          }
          rwd = ro._source;
          ref9 = rwd.snaks;
          for (n = 0, len3 = ref9.length; n < len3; n++) {
            snak = ref9[n];
            if (snkd) {
              break;
            }
            if (snak.property === 'P17' && (cwd = (await this.src.wikidata(snak.qid)))) {
              ref10 = cwd.snaks;
              for (o = 0, len4 = ref10.length; o < len4; o++) {
                sn = ref10[o];
                if (sn.property === 'P297') {
                  snkd = true;
                  rs = (await this.svc.oaworks.permissions.affiliations('issuer.id:"' + sn.value + '"'));
                  break;
                }
              }
            }
          }
        }
      }
    }
    ref13 = (ref11 = rs != null ? (ref12 = rs.hits) != null ? ref12.hits : void 0 : void 0) != null ? ref11 : [];
    for (q = 0, len5 = ref13.length; q < len5; q++) {
      rr = ref13[q];
      tr = (await _prep(rr._source));
      tr.score = (await _score(tr));
      rors.push(tr);
    }
  }
  if (issns.length) {
    qr = issns.length ? 'issuer.id:"' + issns.join('" OR issuer.id:"') + '"' : '';
    ps = (await this.svc.oaworks.permissions.journals(qr));
    ref16 = (ref14 = ps != null ? (ref15 = ps.hits) != null ? ref15.hits : void 0 : void 0) != null ? ref14 : [];
    for (r = 0, len6 = ref16.length; r < len6; r++) {
      p = ref16[r];
      rp = (await _prep(p._source));
      rp.score = (await _score(rp));
      perms.all_permissions.push(rp);
    }
  }
  if (meta.publisher) {
    qr = 'issuer.id:"' + meta.publisher + '"'; // how exact/fuzzy can this be
    ps = (await this.svc.oaworks.permissions.publishers(qr));
    ref19 = (ref17 = ps != null ? (ref18 = ps.hits) != null ? ref18.hits : void 0 : void 0) != null ? ref17 : [];
    for (t = 0, len7 = ref19.length; t < len7; t++) {
      p = ref19[t];
      rp = (await _prep(p._source));
      rp.score = (await _score(rp));
      perms.all_permissions.push(rp);
    }
  }
  //if perms.all_permissions.length is 0 and meta.publisher and not meta.doi and not issns.length
  if (meta.publisher) {
    af = (await this.svc.oaworks.journal('publisher:"' + meta.publisher + '"'));
    if (af == null) {
      fz = (await this.svc.oaworks.journal('publisher:"' + meta.publisher.split(' ').join('" AND publisher:"') + '"'));
      if ((fz != null ? fz.publisher : void 0) === meta.publisher) {
        af = fz;
      } else if (fz != null ? fz.publisher : void 0) {
        lvs = (await this.tdm.levenshtein(fz.publisher, meta.publisher));
        longest = lvs.length.a > lvs.length.b ? lvs.length.a : lvs.length.b;
        if (lvs.distance < 5 || longest / lvs.distance > 10) {
          af = fz;
        }
      }
    }
    if (af != null ? af.publisher : void 0) {
      pisoa = (await this.svc.oaworks.publisher.oa(af.publisher));
    }
  }
  if (typeof af === 'object' && (af.indoaj || pisoa)) {
    altoa = {
      can_archive: true,
      version: 'publishedVersion',
      versions: ['publishedVersion'],
      licence: void 0,
      licence_terms: "",
      licences: [],
      locations: ['institutional repository'],
      embargo_months: void 0,
      issuer: {
        type: 'journal',
        has_policy: 'yes',
        id: af.issn
      },
      meta: {
        creator: ['joe+doaj@openaccessbutton.org'],
        contributors: ['joe+doaj@openaccessbutton.org'],
        monitoring: 'Automatic'
      }
    };
    try {
      altoa.licence = (ref20 = af.doaj.bibjson.license[0].type) != null ? ref20 : af.license[0].type; // could have doaj licence info
    } catch (error) {}
    if (af.indoaj) {
      altoa.embargo_months = 0;
      altoa.provenance = {
        oa_evidence: 'In DOAJ'
      };
    } else if (pisoa) {
      altoa.meta.creator = ['joe+oapublisher@openaccessbutton.org'];
      altoa.meta.contributors = ['joe+oapublisher@openaccessbutton.org'];
      altoa.provenance = {
        oa_evidence: 'OA publisher' // does this mean embargo_months should be zero too?
      };
    }
    if (typeof altoa.licence === 'string') {
      altoa.licence = altoa.licence.toLowerCase().trim();
      if (altoa.licence.indexOf('cc') === 0) {
        altoa.licence = altoa.licence.replace(/ /g, '-');
      } else if (altoa.licence.indexOf('creative') !== -1) {
        altoa.licence = altoa.licence.indexOf('0') !== -1 || altoa.licence.indexOf('zero') !== -1 ? 'cc0' : altoa.licence.indexOf('share') !== -1 ? 'ccbysa' : altoa.licence.indexOf('derivative') !== -1 ? 'ccbynd' : 'ccby';
      } else {
        delete altoa.licence;
      }
    } else {
      delete altoa.licence;
    }
    if (altoa.licence) {
      altoa.licences = [
        {
          type: altoa.licence,
          terms: ""
        }
      ];
    }
    altoa.score = (await _score(altoa));
    perms.all_permissions.push(altoa);
  }
  if (meta.doi && (oadoi = (await this.src.oadoi(meta.doi)))) {
    if (haddoi && (oadoi != null ? (ref21 = oadoi.best_oa_location) != null ? ref21.license : void 0 : void 0) && oadoi.best_oa_location.license.indexOf('cc') !== -1) { //  (haddoi or oadoi?.journal_is_oa)
      doa = {
        can_archive: true,
        version: oadoi.best_oa_location.version,
        versions: [],
        licence: oadoi.best_oa_location.license,
        licence_terms: "",
        licences: [],
        locations: ['institutional repository'],
        issuer: {
          type: 'article',
          has_policy: 'yes',
          id: meta.doi
        },
        meta: {
          creator: ['support@unpaywall.org'],
          contributors: ['support@unpaywall.org'],
          monitoring: 'Automatic',
          updated: oadoi.best_oa_location.updated
        },
        provenance: {
          oa_evidence: oadoi.best_oa_location.evidence
        }
      };
      if (typeof doa.licence === 'string') {
        doa.licences = [
          {
            type: doa.licence,
            terms: ""
          }
        ];
      }
      if (doa.version) {
        doa.versions = (ref22 = doa.version) === 'submittedVersion' || ref22 === 'preprint' ? ['submittedVersion'] : (ref23 = doa.version) === 'acceptedVersion' || ref23 === 'postprint' ? ['submittedVersion', 'acceptedVersion'] : ['submittedVersion', 'acceptedVersion', 'publishedVersion'];
      }
      doa.score = (await _score(doa));
      perms.all_permissions.push(doa);
    }
  }
  // sort rors by score, and sort alts by score, then combine
  if (perms.all_permissions.length) {
    perms.all_permissions.sort((a, b) => {
      if (a.score < b.score) {
        return 1;
      } else {
        return -1;
      }
    });
    ref24 = perms.all_permissions;
    // note if enforcement_from is after published date, don't apply the permission. If no date, the permission applies to everything
    for (u = 0, len8 = ref24.length; u < len8; u++) {
      wp = ref24[u];
      if (!((ref25 = wp.provenance) != null ? ref25.enforcement_from : void 0)) {
        perms.best_permission = this.copy(wp);
        break;
      } else if (!meta.published || Date.parse(meta.published) > Date.parse(wp.provenance.enforcement_from.split('/').reverse().join('-'))) {
        // NOTE Date.parse would try to work on format 31/01/2020 but reads it in American, so would think 31 is a month and is too big
        // but 2020-01-31 is treated in ISO so the 31 will be the day. So, given that we use DD/MM/YYYY, split on / then reverse then join on - to get a better parse
        perms.best_permission = this.copy(wp);
        break;
      }
    }
    if (rors.length) { // this only happens as an augment to some other permission, so far
      rors.sort((a, b) => {
        if (a.score < b.score) {
          return 1;
        } else {
          return -1;
        }
      });
// check this gives the order in the direction we want, else reverse it
      for (v = 0, len9 = rors.length; v < len9; v++) {
        ro = rors[v];
        perms.all_permissions.push(ro);
        if (((ref26 = perms.best_permission) != null ? ref26.author_affiliation_requirement : void 0) == null) {
          if (perms.best_permission != null) {
            if (!((ref27 = ro.provenance) != null ? ref27.enforcement_from : void 0) || !meta.published || Date.parse(meta.published) > Date.parse(ro.provenance.enforcement_from.split('/').reverse().join('-'))) {
              pb = this.copy(perms.best_permission);
              ref28 = ['licences', 'versions', 'locations'];
              for (w = 0, len10 = ref28.length; w < len10; w++) {
                key = ref28[w];
                ref29 = ro[key];
                for (x = 0, len11 = ref29.length; x < len11; x++) {
                  vl = ref29[x];
                  if (pb[key] == null) {
                    pb[key] = [];
                  }
                  if (indexOf.call(pb[key], vl) < 0) {
                    pb[key].push(vl);
                  }
                }
              }
              ref31 = (ref30 = pb.licences) != null ? ref30 : [];
              for (y = 0, len12 = ref31.length; y < len12; y++) {
                l = ref31[y];
                if ((pb.licence == null) || l.type.length < pb.licence.length) {
                  pb.licence = l.type;
                }
              }
              pb.version = indexOf.call(pb.versions, 'publishedVersion') >= 0 || indexOf.call(pb.versions, 'publisher pdf') >= 0 ? 'publishedVersion' : indexOf.call(pb.versions, 'acceptedVersion') >= 0 || indexOf.call(pb.versions, 'postprint') >= 0 ? 'acceptedVersion' : 'submittedVersion';
              if (pb.embargo_end) {
                if (ro.embargo_end) {
                  if (Date.parse(ro.embargo_end) < Date.parse(pb.embargo_end)) {
                    pb.embargo_end = ro.embargo_end;
                  }
                }
              }
              if (pb.embargo_months && (ro.embargo_months != null) && ro.embargo_months < pb.embargo_months) {
                pb.embargo_months = ro.embargo_months;
              }
              if (ro.can_archive === true) {
                pb.can_archive = true;
              }
              if (pb.requirements == null) {
                pb.requirements = {};
              }
              pb.requirements.author_affiliation_requirement = meta.ror == null ? ro.issuer.id : typeof meta.ror === 'string' ? meta.ror : meta.ror[0];
              pb.issuer.affiliation = ro.issuer;
              if (pb.meta == null) {
                pb.meta = {};
              }
              pb.meta.affiliation = ro.meta;
              if (pb.provenance == null) {
                pb.provenance = {};
              }
              pb.provenance.affiliation = ro.provenance;
              pb.score = parseInt(pb.score) + parseInt(ro.score);
              perms.best_permission = pb;
              perms.all_permissions.push(pb);
            }
          }
        }
      }
    }
  }
  if (overall_policy_restriction) {
    msgs = {
      'not publisher': 'Please find another DOI for this article as this is provided as this doesn’t allow us to find required information like who published it'
    };
    return {
      body: typeof overall_policy_restriction !== 'string' ? overall_policy_restriction : (ref32 = msgs[overall_policy_restriction.toLowerCase()]) != null ? ref32 : overall_policy_restriction,
      status: 501
    };
  } else {
    if (this.params.metadata === true || getmeta === true) {
      perms.metadata = meta;
    }
    return perms;
  }
};

// the original sheet, now split into three separate ones, but keep a note in case of use for testing: 
// https://docs.google.com/spreadsheets/d/1qBb0RV1XgO3xOQMdHJBAf3HCJlUgsXqDVauWAtxde4A/edit
P.svc.oaworks.permissions.journals = function(recs) {
  return this.svc.oaworks.permissions._format(recs);
};

P.svc.oaworks.permissions.journals._sheet = '19pDvOY5pge-C0yDSObnkMqqlMJgct3iIjPI2rMPLQEc';

P.svc.oaworks.permissions.journals._prefix = false;

P.svc.oaworks.permissions.publishers = function(recs) {
  return this.svc.oaworks.permissions._format(recs);
};

P.svc.oaworks.permissions.publishers._sheet = '1tmEfeJ6RCTCQjcCht-FI7FH-04z7MPSKdUnm0UpAxWM';

P.svc.oaworks.permissions.publishers._prefix = false;

P.svc.oaworks.permissions.affiliations = function(recs) {
  return this.svc.oaworks.permissions._format(recs);
};

P.svc.oaworks.permissions.affiliations._sheet = '1J4WhZjPsAjpoogsj7wSTQGJPguo7TiSe0uNcrvyd_OM';

P.svc.oaworks.permissions.affiliations._prefix = false;

P.svc.oaworks.permissions._format = async function(recs = []) {
  var af, an, cids, dt, i, j, k, keys, kn, l, lc, len, len1, len2, len3, len4, len5, m, n, name, nd, nid, nk, nps, nr, nv, o, q, rcs, ready, rec, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, s, st;
  if (typeof recs === 'object' && !Array.isArray(recs)) {
    recs = [recs];
  }
  keys = {
    versionsarchivable: 'versions',
    permissionsrequestcontactemail: 'permissions_contact',
    archivinglocationsallowed: 'locations',
    license: 'licence',
    licencesallowed: 'licences',
    'post-printembargo': 'embargo_months',
    depositstatementrequired: 'deposit_statement',
    copyrightowner: 'copyright_owner', // can be journal, publisher, affiliation or author
    publicnotes: 'notes',
    authoraffiliationrolerequirement: 'requirements.role',
    authoraffiliationrequirement: 'requirements.affiliation',
    authoraffiliationdepartmentrequirement: 'requirements.departmental_affiliation',
    iffundedby: 'requirements.funder',
    fundingproportionrequired: 'requirements.funding_proportion',
    subjectcoverage: 'requirements.subject',
    has_policy: 'issuer.has_policy',
    permissiontype: 'issuer.type',
    parentpolicy: 'issuer.parent_policy',
    contributedby: 'meta.contributors',
    recordlastupdated: 'meta.updated',
    reviewers: 'meta.reviewer',
    addedby: 'meta.creator',
    monitoringtype: 'meta.monitoring',
    policyfulltext: 'provenance.archiving_policy',
    policylandingpage: 'provenance.archiving_policy_splash',
    publishingagreement: 'provenance.sample_publishing_agreement',
    publishingagreementsplash: 'provenance.sample_publishing_splash',
    rights: 'provenance.author_rights',
    embargolist: 'provenance.embargo_list',
    policyfaq: 'provenance.faq',
    miscsource: 'provenance.misc_source',
    enforcementdate: 'provenance.enforcement_from',
    example: 'provenance.example'
  };
  ready = [];
  for (i = 0, len = recs.length; i < len; i++) {
    rec = recs[i];
    nr = {
      can_archive: false,
      version: void 0,
      versions: void 0,
      licence: void 0,
      licence_terms: void 0,
      licences: void 0,
      locations: void 0,
      embargo_months: void 0,
      embargo_end: void 0,
      deposit_statement: void 0,
      permission_required: void 0,
      permissions_contact: void 0,
      copyright_owner: void 0,
      copyright_name: void 0,
      copyright_year: void 0,
      notes: void 0,
      requirements: void 0,
      issuer: {},
      meta: {},
      provenance: void 0
    };
    try {
      rec.recordlastupdated = rec.recordlastupdated.trim();
      if (rec.recordlastupdated.indexOf(',') !== -1) {
        nd = false;
        ref = rec.recordlastupdated.split(',');
        for (j = 0, len1 = ref.length; j < len1; j++) {
          dt = ref[j];
          if (nd === false || Date.parse(dt.trim().split('/').reverse().join('-')) > Date.parse(nd.split('/').reverse().join('-'))) {
            nd = dt.trim();
          }
        }
        if (nd !== false) {
          rec.recordlastupdated = nd;
        }
      }
      nr.meta.updated = rec.recordlastupdated;
    } catch (error) {}
    if (nr.meta.updated != null) {
      nr.meta.updatedAt = Date.parse(nr.meta.updated.split('/').reverse().join('-'));
    }
    // the google feed import will lowercase these key names and remove whitespace, question marks, brackets too, but not dashes
    nr.issuer.id = typeof rec.id === 'string' && rec.id.indexOf(',') !== -1 ? rec.id.split(',') : rec.id;
    if (nr.issuer.id != null) {
      if (typeof nr.issuer.id !== 'string') {
        cids = [];
        ref1 = nr.issuer.id;
        for (m = 0, len2 = ref1.length; m < len2; m++) {
          nid = ref1[m];
          nid = nid.trim();
          if (nr.issuer.type === 'journal' && nid.indexOf('-') !== -1 && nid.indexOf(' ') === -1) {
            nid = nid.toUpperCase();
            if (af = (await this.svc.oaworks.journal('issn.exact:"' + nid + '"'))) {
              ref2 = af.issn;
              for (n = 0, len3 = ref2.length; n < len3; n++) {
                an = ref2[n];
                if (indexOf.call(cids, an) < 0) {
                  cids.push(an);
                }
              }
            }
          }
          if (indexOf.call(cids, nid) < 0) {
            cids.push(nid);
          }
        }
        nr.issuer.id = cids;
      } else if (nr.issuer.id.startsWith('10.') && nr.issuer.id.indexOf('/') !== -1 && nr.issuer.id.indexOf(' ') === -1) {
        nr.DOI = nr.issuer.id;
      }
    }
    nr.permission_required = typeof rec.has_policy === 'string' && rec.has_policy.toLowerCase().indexOf('permission required') !== -1;
    for (k in rec) {
      if (keys[k] && (rec[k] != null) && rec[k].length !== 0) {
        nk = keys[k];
        nv = void 0;
        if (k === 'post-printembargo') { // Post-Print Embargo - empty or number of months like 0, 12, 24
          try {
            kn = parseInt(rec[k].trim());
            if (typeof kn === 'number' && !isNaN(kn && kn !== 0)) {
              nv = kn;
            }
            if (nv != null) {
              nr.embargo_end = ''; // just to allow neat output later - can't be calculated until compared to a particular article
            }
          } catch (error) {}
        } else if (k === 'journal' || k === 'versionsarchivable' || k === 'archivinglocationsallowed' || k === 'licencesallowed' || k === 'policyfulltext' || k === 'contributedby' || k === 'addedby' || k === 'reviewers' || k === 'iffundedby') {
          nv = [];
          ref3 = rcs = rec[k].trim().split(',');
          for (o = 0, len4 = ref3.length; o < len4; o++) {
            s = ref3[o];
            st = s.trim();
            if (k === 'licencesallowed') {
              if (st.toLowerCase() !== 'unclear') {
                lc = {
                  type: st.toLowerCase()
                };
                try {
                  lc.terms = rec.licenceterms.split(',')[rcs.indexOf(s)].trim(); // these don't seem to exist any more...
                } catch (error) {}
                nv.push(lc);
              }
            } else {
              if (k === 'versionsarchivable') {
                st = st.toLowerCase();
                if (st === 'preprint') {
                  st = 'submittedVersion';
                }
                if (st === 'postprint') {
                  st = 'acceptedVersion';
                }
                if (st === 'publisher pdf') {
                  st = 'publishedVersion';
                }
              }
              if (st.length && indexOf.call(nv, st) < 0) {
                nv.push(k === 'archivinglocationsallowed' ? st.toLowerCase() : st);
              }
            }
          }
        } else if (k !== 'recordlastupdated') {
          nv = rec[k].trim();
        }
        if (typeof nv === 'string' && (((ref4 = nv.toLowerCase()) === 'yes' || ref4 === 'no') || (k === 'haspolicy' || k === 'permissiontype' || k === 'copyrightowner'))) {
          nv = nv.toLowerCase();
        }
        if ((k === 'copyrightowner' || k === 'license') && nv === 'unclear') {
          nv = '';
        }
        if (nv != null) {
          if (nk.indexOf('.') !== -1) {
            nps = nk.split('.');
            if (nr[name = nps[0]] == null) {
              nr[name] = {};
            }
            nr[nps[0]][[nps[1]]] = nv;
          } else {
            nr[nk] = nv;
          }
        }
      }
    }
    if (nr.licences == null) {
      nr.licences = [];
    }
    if (!nr.licence) {
      ref5 = nr.licences;
      for (q = 0, len5 = ref5.length; q < len5; q++) {
        l = ref5[q];
        if ((nr.licence == null) || l.type.length < nr.licence.length) {
          nr.licence = l.type;
          nr.licence_terms = l.terms;
        }
      }
    }
    if (nr.versions == null) {
      nr.versions = [];
    }
    if (nr.versions.length) {
      nr.can_archive = true;
      nr.version = indexOf.call(nr.versions, 'acceptedVersion') >= 0 || indexOf.call(nr.versions, 'postprint') >= 0 ? 'acceptedVersion' : indexOf.call(nr.versions, 'publishedVersion') >= 0 || indexOf.call(nr.versions, 'publisher pdf') >= 0 ? 'publishedVersion' : 'submittedVersion';
    }
    if (nr.copyright_owner == null) {
      nr.copyright_owner = (ref6 = (ref7 = nr.issuer) != null ? ref7.type : void 0) != null ? ref6 : '';
    }
    if (nr.copyright_name == null) {
      nr.copyright_name = '';
    }
    if (nr.copyright_year == null) {
      nr.copyright_year = ''; // the year of publication, to be added at result stage
    }
    if (!JSON.stringify(nr) !== '{}') {
      ready.push(nr);
    }
  }
  if (ready.length === 1) {
    return ready[0];
  } else {
    return ready;
  }
};

`API.add 'service/oab/request/:rid',
  post:
    roleRequired:'openaccessbutton.user',
    action: () ->
      if r = oab_request.get this.urlParams.rid
        n = {}
        if not r.user? and not r.story? and this.request.body.story
          n.story = this.request.body.story
          n.user = id: this.user._id, email: this.user.emails[0].address, username: (this.user.profile?.firstname ? this.user.username ? this.user.emails[0].address)
          n.user.firstname = this.user.profile?.firstname
          n.user.lastname = this.user.profile?.lastname
          n.user.affiliation = this.user.service?.openaccessbutton?.profile?.affiliation
          n.user.profession = this.user.service?.openaccessbutton?.profile?.profession
          n.count = 1 if not r.count? or r.count is 0
        if API.accounts.auth 'openaccessbutton.admin', this.user
          n.test ?= this.request.body.test if this.request.body.test? and this.request.body.test isnt r.test
          n.status ?= this.request.body.status if this.request.body.status? and this.request.body.status isnt r.status
          n.rating ?= this.request.body.rating if this.request.body.rating? and this.request.body.rating isnt r.rating
          n.name ?= this.request.body.name if this.request.body.name? and this.request.body.name isnt r.name
          n.email ?= this.request.body.email if this.request.body.email? and this.request.body.email isnt r.email
          n.author_affiliation ?= this.request.body.author_affiliation if this.request.body.author_affiliation? and this.request.body.author_affiliation isnt r.author_affiliation
          n.story ?= this.request.body.story if this.request.body.story? and this.request.body.story isnt r.story
          n.journal ?= this.request.body.journal if this.request.body.journal? and this.request.body.journal isnt r.journal
          n.notes = this.request.body.notes if this.request.body.notes? and this.request.body.notes isnt r.notes
          n.access_right = this.request.body.access_right if this.request.body.access_right? and this.request.body.access_right isnt r.access_right
          n.embargo_date = this.request.body.embargo_date if this.request.body.embargo_date? and this.request.body.embargo_date isnt r.embargo_date
          n.access_conditions = this.request.body.access_conditions if this.request.body.access_conditions? and this.request.body.access_conditions isnt r.access_conditions
          n.license = this.request.body.license if this.request.body.license? and this.request.body.license isnt r.license
          if this.request.body.received?.description? and (not r.received? or this.request.body.received.description isnt r.received.description)
            n.received = if r.received? then r.received else {}
            n.received.description = this.request.body.received.description
        n.email = this.request.body.email if this.request.body.email? and ( API.accounts.auth('openaccessbutton.admin',this.user) || not r.status? || r.status is 'help' || r.status is 'moderate' || r.status is 'refused' )
        n.story = this.request.body.story if r.user? and this.userId is r.user.id and this.request.body.story? and this.request.body.story isnt r.story
        n.url ?= this.request.body.url if this.request.body.url? and this.request.body.url isnt r.url
        n.title ?= this.request.body.title if this.request.body.title? and this.request.body.title isnt r.title
        n.doi ?= this.request.body.doi if this.request.body.doi? and this.request.body.doi isnt r.doi
        if n.story
          res = oab_request.search 'rating:1 AND story.exact:"' + n.story + '"'
          if res.hits.total
            nres = oab_request.search 'rating:0 AND story.exact:"' + n.story + '"'
            n.rating = 1 if nres.hits.total is 0
        if not n.status?
          if (not r.title and not n.title) || (not r.email and not n.email) || (not r.story and not n.story)
            n.status = 'help' if r.status isnt 'help'
          else if r.status is 'help' and ( (r.title or n.title) and (r.email or n.email) and (r.story or n.story) )
            n.status = 'moderate'
        if n.title? and typeof n.title is 'string'
          try n.title = n.title.charAt(0).toUpperCase() + n.title.slice(1)
        if n.journal? and typeof n.journal is 'string'
          try n.journal = n.journal.charAt(0).toUpperCase() + n.journal.slice(1)
        if not n.doi? and not r.doi? and r.url? and r.url.indexOf('10.') isnt -1 and r.url.split('10.')[1].indexOf('/') isnt -1
          n.doi = '10.' + r.url.split('10.')[1]
          r.doi = n.doi
        if (r.doi or r.url) and not r.title and not n.title
          try
            cr = if r.doi then API.service.oab.metadata(undefined, {doi: r.doi}) else API.service.oab.metadata {url: r.url}
            for c of cr
              n[c] ?= cr[c] if not r[c]?
        r.author_affiliation = n.author_affiliation if n.author_affiliation?
        if n.crossref_type? and n.crossref_type isnt 'journal-article'
          n.status = 'closed'
          n.closed_on_update = true
          n.closed_on_update_reason = 'notarticle'
        if (not r.email and not n.email) and r.author and r.author.length and (r.author[0].affiliation? or r.author_affiliation)
          try
            email = API.use.hunter.email {company: (r.author_affiliation ? r.author[0].affiliation[0].name), first_name: r.author[0].family, last_name: r.author[0].given}, API.settings.service.openaccessbutton.hunter.api_key
            if email?.email?
              n.email = email.email
        oab_request.update(r._id,n) if JSON.stringify(n) isnt '{}'
        if (r.user?.email? or n.user?.email?) and (not r.user or (not r.story? and n.story))
          try
            tmpl = API.mail.template 'initiator_confirmation.html'
            sub = API.service.oab.substitute tmpl.content, {_id: r._id, url: (r.url ? n.url), title:(r.title ? n.title ? r.url) }
            API.mail.send
              service: 'openaccessbutton',
              from: sub.from ? API.settings.service.openaccessbutton.mail.from
              to: n.user?.email ? r.user.email
              subject: sub.subject ? 'New request created ' + r._id
              html: sub.content
        return oab_request.get r._id
      else
        return undefined
  delete:
    roleRequired:'openaccessbutton.user'
    action: () ->
      r = oab_request.get this.urlParams.rid
      oab_request.remove(this.urlParams.rid) if API.accounts.auth('openaccessbutton.admin',this.user) or this.userId is r.user.id
      return {}`;
/*
to create a request the url and type are required, What about story?
{
  url: "url of item request is about",
  story: "the story of why this request / support, if supplied",
  email: "email address of person to contact to request",
  count: "the count of how many people support this request",
  createdAt: "date request was created",
  status: "help OR moderate OR progress OR hold OR refused OR received OR closed",
  receiver: "unique ID that the receive endpoint will use to accept one-time submission of content",
  title: "article title",
  doi: "article doi",
  user: {
    id: "user ID of user who created request",
    username: "username of user who created request",
    email: "email of user who created request"
  }
}
*/
`P.svc.oaworks.request = (req, uacc, fast, notify=true) ->
  dom
  if req.dom
    dom = req.dom
    delete req.dom
  return false if JSON.stringify(req).indexOf('<script') isnt -1
  req = @tdm.clean req
  req.type ?= 'article'
  req.url = req.url[0] if _.isArray req.url
  req.doi = req.url if not req.doi? and req.url? and req.url.indexOf('10.') isnt -1 and req.url.split('10.')[1].indexOf('/') isnt -1
  req.doi = '10.' + req.doi.split('10.')[1].split('?')[0].split('#')[0] if req.doi? and req.doi.indexOf('10.') isnt 0
  req.doi = decodeURIComponent(req.doi) if req.doi
  if req.url? and req.url.indexOf('eu.alma.exlibrisgroup.com') isnt -1
    req.url += (if req.url.indexOf('?') is -1 then '?' else '&') + 'oabLibris=' + Random.id()
    if req.title? and typeof req.title is 'string' and req.title.length > 0 and texist = oab_request.find {title:req.title,type:req.type}
      texist.cache = true
      return texist
  else if req.doi or req.title or req.url
    eq = {type: req.type}
    if req.doi
      eq.doi = req.doi
    else if req.title
      eq.title = req.title
    else
      eq.url = req.url
    if exists = oab_request.find eq
      exists.cache = true
      return exists
  return false if not req.test and @svc.oaworks.blacklist req.url

  rid = if req._id and oab_request.get(req._id) then req._id else oab_request.insert {url:req.url,type:req.type,_id:req._id}
  user = if uacc then (if typeof uacc is 'string' then API.accounts.retrieve(uacc) else uacc) else undefined
  send_confirmation = false
  if not req.user? and user and req.story
    send_confirmation = true
    un = user.profile?.firstname ? user.username ? user.emails[0].address
    req.user =
      id: user._id
      username: un
      email: user.emails[0].address
      firstname: user.profile?.firstname
      lastname: user.profile?.lastname
      affiliation: user.service?.openaccessbutton?.profile?.affiliation
      profession: user.service?.openaccessbutton?.profile?.profession
  req.count ?= if req.story then 1 else 0

  if not req.doi or not req.title or not req.email
    try
      cr = @svc.oaworks.metadata {url: req.url}, {doi: req.doi}
      for c of cr
        if c is 'email'
          for e in cr.email
            isauthor = false
            if cr?.author?
              for a in cr.author
                isauthor = a.family and e.toLowerCase().indexOf(a.family.toLowerCase()) isnt -1
            if isauthor and @mail.validate(e, @S.svc.oaworks.mail?.pubkey).is_valid
              req.email = e
              break
        else
          req[c] ?= cr[c]
  if _.isArray(req.author) and not req.author_affiliation
    for author in req.author
      try
        if req.email.toLowerCase().indexOf(author.family) isnt -1
          req.author_affiliation = author.affiliation[0].name
          break
  req.keywords ?= []
  req.title ?= ''
  req.doi ?= ''
  req.author = []
  req.journal = ''
  req.issn = ''
  req.publisher = ''
  if not req.email and req.author_affiliation
    try
      for author in req.author
        if author.affiliation[0].name is req.author_affiliation
          # it would be possible to lookup ORCID here if the author has one in the crossref data, but that would only get us an email for people who make it public
          # previous analysis showed that this is rare. So not doing it yet
          email = @src.hunter.email {company: req.author_affiliation, first_name: author.family, last_name: author.given}, @S.svc.oaworks.hunter.api_key
          if email?.email?
            req.email = email.email
            break

  if req.story
    res = oab_request.search 'rating:1 AND story.exact:"' + req.story + '"'
    if res.hits.total
      nres = oab_request.search 'rating:0 AND story.exact:"' + req.story + '"'
      req.rating = 1 if nres.hits.total is 0

  req.status ?= if not req.story or not req.title or not req.email or not req.user? then "help" else "moderate"
  if req.year
    try
      req.year = parseInt(req.year) if typeof req.year is 'string'
      if req.year < 2000
        req.status = 'closed'
        req.closed_on_create = true
        req.closed_on_create_reason = 'pre2000'
    try
      if fast and (new Date()).getFullYear() - req.year > 5 # only doing these on fast means only doing them via UI for now
        req.status = 'closed'
        req.closed_on_create = true
        req.closed_on_create_reason = 'gt5'
  if fast and not req.doi? and req.status isnt 'closed'
    req.status = 'closed'
    req.closed_on_create = true
    req.closed_on_create_reason = 'nodoi'
  if fast and req.crossref_type? and req.crossref_type isnt 'journal-article' and req.status isnt 'closed'
    req.status = 'closed'
    req.closed_on_create = true
    req.closed_on_create_reason = 'notarticle'

  req.receiver = @uid()
  req._id = rid
  if req.title? and typeof req.title is 'string'
    try req.title = req.title.charAt(0).toUpperCase() + req.title.slice(1)
  if req.journal? and typeof req.journal is 'string'
    try req.journal = req.journal.charAt(0).toUpperCase() + req.journal.slice(1)
  oab_request.update rid, req
  if (fast and req.user?.email?) or send_confirmation
    try
      tmpl = API.mail.template 'initiator_confirmation.html'
      sub = API.service.oab.substitute tmpl.content, {_id: req._id, url: req.url, title:(req.title ? req.url) }
      @mail
        service: 'openaccessbutton',
        from: sub.from ? @S.svc.oaworks.mail.from
        to: req.user.email
        subject: sub.subject ? 'New request created ' + req._id
        html: sub.content
  if req.story # and notify
    # for now still send if not notify, but remove Natalia (Joe requested it this way, so he still gets them on bulk creates, but Natalia does not)
    addrs = @S.svc.oaworks.notify.request
    if not notify and typeof addrs isnt 'string' and 'natalia.norori@openaccessbutton.org' in addrs
      addrs.splice(addrs.indexOf('natalia.norori@openaccessbutton.org'),1)
    @mail
      service: 'openaccessbutton'
      from: 'natalia.norori@openaccessbutton.org'
      to: addrs
      subject: 'New request created ' + req._id
      text: (if @S.dev then 'https://dev.openaccessbutton.org/request/' else 'https://openaccessbutton.org/request/') + req._id
  return req`;


P.svc.rscvd = function() {
  return 'RSCVD API (prototype)';
};

P.svc.rscvd._index = true;

//P.svc.rscvd._html = _qopts: {include: ['title', 'status', 'publisher', 'year', 'doi', 'issn', 'isbn']}
P.svc.rscvd.retrieve = async function() {
  var ak, i, j, key, kv, len, len1, params, r, rec, recs, ref, ref1, ref2, res, sid, size, u, val;
  ak = this.apikey; //? ''
  size = (ref = this.params.size) != null ? ref : '20000';
  if (ak) {
    res = (await this.fetch('https://api.cottagelabs.com/log?apikey=' + ak + '&sort=createdAt:asc&q=endpoint:collect&size=' + size));
    recs = [];
    ref1 = res.hits.hits;
    for (i = 0, len = ref1.length; i < len; i++) {
      r = ref1[i];
      // /api/service/oab/ill/collect/AKfycbwFA_R-0gjzVS9029ByVpduCYJbHLH0ujstNng1aNnRogw1htU?where=InstantILL&doi=10.3109%252F0167482X.2010.503330&atitle=Management%2520of%2520post%2520traumatic%2520stress%2520disorder%2520after%2520childbirth%253A%2520a%2520review&crossref_type=journal-article&aulast=Lapp%252C%2520Leann%2520K.%252C%2520Agbokou%252C%2520Catherine%252C%2520Peretti%252C%2520Charles-Siegfried%252C%2520Ferreri%252C%2520Florian&title=Journal%2520of%2520Psychosomatic%2520Obstetrics%2520%2526%2520Gynecology&issue=3&volume=31&pages=113-122&issn=0167-482X&publisher=Informa%2520UK%2520Limited&year=2010&date=2010-07-01&url=https%253A%252F%252Fdoi.org%252F10.3109%252F0167482X.2010.503330&notes=Subscription%2520check%2520done%2C%2520found%2520nothing.%2520OA%2520availability%2520check%2520done%2C%2520found%2520nothing.&email=mcclay.ill%2540qub.ac.uk&name=Ivona%2520Coghlan&organization=McClay%2520Library%252C%2520Queen%27s%2520University%2520Belfast&reference=IC00226&other=
      u = r._source.url;
      if (typeof u === 'string' && u.startsWith('/api/service/oab/ill/collect/')) {
        [sid, params] = u.replace('/api/service/oab/ill/collect/', '').split('?');
        if (typeof sid === 'string' && typeof params === 'string') {
          rec = {
            sid: sid,
            status: 'Awaiting verification'
          };
          rec.type = r._source.sid === 'AKfycbwFA_R-0gjzVS9029ByVpduCYJbHLH0ujstNng1aNnRogw1htU' ? 'Paper' : r._source.sid === 'AKfycbwPq7xWoTLwnqZHv7gJAwtsHRkreJ1hMJVeeplxDG_MipdIamU6' ? 'Book' : '';
          try {
            rec.createdAt = new Date(parseInt(r._source.createdAt));
          } catch (error) {}
          ref2 = params.split('&');
          for (j = 0, len1 = ref2.length; j < len1; j++) {
            kv = ref2[j];
            [key, val] = kv.split('=');
            rec[key] = decodeURIComponent(decodeURIComponent(val));
            try {
              if (key === 'date' || key === 'needed-by') {
                rec[key] = (await this.date(rec[key]));
              }
            } catch (error) {}
          }
          recs.push(rec);
        }
      }
    }
    if (recs.length) {
      await this.svc.rscvd('');
      this.waitUntil(this.svc.rscvd(recs));
    }
    return res.hits.total + ', ' + recs.length;
  }
};

P.svc.rscvd.verify = async function(verify = true) {
  if (!this.params.verify) {
    return void 0;
  }
  await this.index._each('svc_rscvd', 'email:"' + this.params.verify + '"', {
    action: 'index'
  }, function(rec) {
    rec.verified = verify;
    if (!rec.status || rec.status === 'Awaiting verification') {
      rec.status = verify ? 'Verified' : 'Denied';
    }
    return rec;
  });
  return true;
};

P.svc.rscvd.deny = function() {
  return this.svc.rscvd.verify(false);
};

P.svc.rscvd.status = async function() {
  var rec, rid, status;
  if (!this.params.status) {
    return void 0;
  }
  [rid, status] = this.params.status.split('/');
  rec = (await this.svc.rscvd(rid));
  rec.status = status;
  this.svc.rscvd(rec);
  return rec;
};

P.svc.rscvd.supply = async function() {
  var body, c, columns, email_filter, h, headers, i, j, k, l, len, len1, len2, len3, len4, len5, m, n, o, opts, pager, qr, r, ref, ref1, ref10, ref11, ref12, ref13, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9, res, size, sopts, st, status_filter, val;
  body = '<html><head>';
  body += '<style>table.paradigm tr:nth-child(even) {background: #eee}table.paradigm tr:nth-child(odd) {background: #fff}</style>\n';
  body += '</head>';
  body += '\n<body><h1>RSCVD Supply prototype <small id="welcome"></small></h1>';
  opts = {
    sort: {
      createdAt: 'desc'
    },
    terms: ['email', 'status']
  };
  size = 500;
  if (!this.params.size) {
    opts.size = size;
  }
  qr = (await this.index.translate((JSON.stringify(this.params) !== '{}' ? this.params : 'email:* AND (title:* OR atitle:*)'), opts));
  res = (await this.svc.rscvd(qr));
  status_filter = '<select class="filter" id="status"><option value="">' + (this.params.q && this.params.q.includes('status:') ? 'clear status filter' : 'Filter by status') + '</option>';
  ref = res.aggregations.status.buckets;
  for (i = 0, len = ref.length; i < len; i++) {
    st = ref[i];
    if (st.key) {
      status_filter += '<option value="' + st.key + '"' + (this.params.q && this.params.q.includes(st.key) ? ' selected="selected"' : '') + '>' + st.key + ' (' + st.doc_count + ')' + '</option>';
    }
  }
  status_filter += '</select>';
  email_filter = '<select class="filter" id="email"><option value="">' + (this.params.q && this.params.q.includes('email:') ? 'clear requestee filter' : 'Filter by requestee') + '</option>';
  ref1 = res.aggregations.email.buckets;
  for (j = 0, len1 = ref1.length; j < len1; j++) {
    st = ref1[j];
    if (st.key) {
      email_filter += '<option value="' + st.key + '"' + (this.params.q && this.params.q.includes(st.key) ? ' selected="selected"' : '') + '>' + st.key + ' (' + st.doc_count + ')' + '</option>';
    }
  }
  email_filter += '</select>';
  body += '<table class="paradigm" style="border-collapse: collapse;">\n';
  body += '<thead><tr>';
  headers = [
    'Item',
    'Requestee',
    'Status' //, 'Publisher', 'Year', 'DOI', 'ISSN', 'ISBN']
  ];
  for (l = 0, len2 = headers.length; l < len2; l++) {
    h = headers[l];
    body += '<th style="padding:2px; border:1px solid #ccc;">';
    if (h === 'Item') {
      pager = qr.from ? '<a class="pager ' + (qr.from - ((ref2 = qr.size) != null ? ref2 : size)) + '" href="#">&lt; back</a> items ' : 'Items ';
      if (res.hits.total > res.hits.hits.length) {
        pager += ((ref3 = qr.from) != null ? ref3 : 1) + ' to ' + (((ref4 = qr.from) != null ? ref4 : 0) + ((ref5 = qr.size) != null ? ref5 : size));
        pager += '. <a class="pager ' + (((ref6 = qr.from) != null ? ref6 : 0) + ((ref7 = qr.size) != null ? ref7 : size)) + '" href="#">next &gt;</a>';
      }
      body += pager;
    } else {
      body += h;
      if (h === 'Requestee') {
        body += '<br>' + email_filter;
      }
      if (h === 'Status') {
        body += '<br>' + status_filter;
      }
    }
    body += '</th>';
  }
  body += '</tr></thead>';
  body += '<tbody>';
  columns = [
    'title',
    'email',
    'status' //, 'publisher', 'year', 'doi', 'issn', 'isbn']
  ];
  ref8 = res.hits.hits;
  for (m = 0, len3 = ref8.length; m < len3; m++) {
    r = ref8[m];
    for (k in r._source) {
      if (typeof r._source[k] === 'string' && r._source[k].includes('%')) {
        try {
          r._source[k] = decodeURIComponent(r._source[k]);
        } catch (error) {}
      }
    }
    body += '\n<tr>';
    for (n = 0, len4 = columns.length; n < len4; n++) {
      c = columns[n];
      val = (ref9 = r._source[c]) != null ? ref9 : '';
      if (c === 'title') {
        if ((ref10 = r._source.sid) === 'AKfycbwFA_R-0gjzVS9029ByVpduCYJbHLH0ujstNng1aNnRogw1htU' || ref10 === 'AKfycbwPq7xWoTLwnqZHv7gJAwtsHRkreJ1hMJVeeplxDG_MipdIamU6') {
          val = '<a class="types" href="#">';
          val += r._source.sid === 'AKfycbwFA_R-0gjzVS9029ByVpduCYJbHLH0ujstNng1aNnRogw1htU' ? 'Paper' : 'Book';
          val += '</a><br>';
        } else {
          val = '';
        }
        val += (r._source.doi && r._source.doi.startsWith('10.') ? '<a target="_blank" href="https://doi.org/' + r._source.doi + '">' : '') + '<b>' + ((ref11 = r._source.atitle) != null ? ref11 : r._source.title) + '</b>' + (r._source.doi && r._source.doi.startsWith('10.') ? '</a>' : '');
        if (r._source.year || r._source.publisher || (r._source.title && r._source.atitle)) {
          val += '<br>' + (r._source.year ? r._source.year + ' ' : '') + (r._source.title && r._source.atitle ? '<i><a class="title" href="#">' + r._source.title + '</a></i>' + (r._source.publisher ? ', ' : '') : '') + ((ref12 = r._source.publisher) != null ? ref12 : '');
        }
        if (r._source.doi || r._source.issn || r._source.isbn) {
          val += '<br>' + (r._source.doi && r._source.doi.startsWith('10.') ? '<a target="_blank" href="https://doi.org/' + r._source.doi + '">' + r._source.doi + '</a> ' : '') + (r._source.issn ? ' ISSN ' + r._source.issn : '') + (r._source.isbn ? ' ISBN ' + r._source.isbn : '');
        }
      } else if (c === 'email') {
        if (r._source.verified != null) {
          val = '<b style="color:' + (r._source.verified ? 'green' : 'red') + ';">' + r._source.email + '</b>';
          if (r._source.verified) {
            if (r._source['needed-by']) {
              val += '<br>Required by ' + r._source['needed-by'].split('-').reverse().join('/');
              if (r._source.reference) {
                val += '<br>Ref: ' + r._source.reference;
              }
            }
          }
        } else {
          val = r._source.email;
          val += '<br>' + ((ref13 = r._source.name) != null ? ref13 : '') + (r._source.organization ? (r._source.name ? ', ' : '') + r._source.organization : '');
        }
      } else if (c === 'status') {
        if (r._source.verified != null) {
          if (r._source.verified) {
            val = '<select class="status ' + r._id + '" style="margin-top:5px; margin-bottom:0px; min-width:180px;">';
            sopts = ['Verified', 'Denied', 'Progressing', 'Overdue', 'Provided', 'Cancelled', 'Done'];
            if (!r._source.status) {
              sopts.unshift('');
            }
            for (o = 0, len5 = sopts.length; o < len5; o++) {
              st = sopts[o];
              val += '<option' + (r._source.status === st ? ' selected="selected"' : '') + '>' + st + '</option>';
            }
            val += '</select>';
          } else {
            val = 'Requestee denied';
          }
        } else {
          val = '<a class="verify ' + r._source.email + '" style="color:green" href="#">Verify</a> or <a class="verify deny ' + r._source.email + '" style="color:red" href="#">Deny</a><br>the requestee';
        }
      }
      body += '<td style="padding:2px; border:1px solid #ccc; vertical-align:text-top;' + (c === 'title' ? ' width:60%;' : '') + '">' + val + '</td>';
    }
    body += '</tr>';
  }
  body += '\n</tbody></table>';
  body += '</body>';
  body += '\n<script src="/client/pradm.js"></script>';
  body += '\n<script src="/client/pradmLogin.js"></script>';
  body += `<script>
pradm.listen("click", ".verify", function(e) {
  e.preventDefault();
  var el = e.target;
  var cls = pradm.classes(el);
  cls.pop();
  pradm.html(el, (cls.indexOf("deny") !== -1 ? "Deny" : "Verify") + 'ing...');
  var url = "/svc/rscvd/" + (cls.indexOf("deny") !== -1 ? "deny" : "verify") + "/" + cls.pop();
  pradm.ajax(url);
  setTimeout(function() { location.reload(); }, 3000);
});
pradm.listen("change", ".status", function(e) {
  var el = e.target;
  var cls = pradm.classes(el);
  cls.pop();
  var url = "/svc/rscvd/status/" + cls.pop() + "/" + el.value;
  pradm.html(el, 'Updating...');
  pradm.ajax(url);
  setTimeout(function() { location.reload(); }, 3000);
});
pradm.listen("change", ".filter", function(e) {
  var status = pradm.get('#status');
  var email = pradm.get('#email');
  var q = '';
  if (status) q += 'status:"' + status + '"';
  if (email) {
    if (q.length) q += ' AND ';
    q += 'email:"' + email + '"';
  }
  window.history.pushState("", "", window.location.pathname + (q !== '' ? "?q=" + q : ''));
  location.reload();
});
pradm.listen("click", ".pager", function(e) {
  e.preventDefault();
  var el = e.target;
  var cls = pradm.classes(el);
  cls.pop();
  window.history.pushState("", "", window.location.pathname + "?from=" + cls.pop());
  location.reload();
});
pradm.listen("click", ".title", function(e) {
  e.preventDefault();
  var el = e.target;
  window.history.pushState("", "", window.location.pathname + '?q=title:"' + el.innerHTML + '"');
  location.reload();
});
pradm.listen("click", ".types", function(e) {
  e.preventDefault();
  var el = e.target;
  var type = el.innerHTML;
  window.history.pushState("", "", window.location.pathname + '?q=sid:"' + (type === 'Paper' ? 'AKfycbwFA_R-0gjzVS9029ByVpduCYJbHLH0ujstNng1aNnRogw1htU' : 'AKfycbwPq7xWoTLwnqZHv7gJAwtsHRkreJ1hMJVeeplxDG_MipdIamU6') + '"');
  location.reload();
});
try {
  var name = pradm.account.email.split('@')[0];
  name = name.substring(0,1).toUpperCase() + name.substring(1);
  pradm.html('#welcome', ' for <a id="logout" href="#">' + name + '</a>');
  pradm.listen("click", "#logout", function(e) {
    e.preventDefault();
    pradm.next = true;
    pradm.logout();
  });
} catch (err) {}
</script>`;
  body += '</html>';
  this.format = 'html';
  return body; //headers: {'Content-Type': 'text/html; charset=UTF-8'}, body: body
};

P.svc.rscvd.supply._auth = true;

// https://jcheminf.springeropen.com/articles/10.1186/1758-2946-3-47
P.svc.oaworks.scrape = async function(content, doi) {
  var cl, cnts, d, i, j, k, kk, l, len, len1, len2, len3, len4, m, me, meta, mk, mkp, mls, mm, mr, mstr, my, n, o, p, q, ref, ref1, ref2, str, ud;
  meta = {
    doi: doi
  };
  if (typeof content === 'string' && content.startsWith('http')) {
    if (!meta.doi) { // quick check to get a DOI if at the end of a URL, as they often are
      mr = new RegExp(/\/(10\.[^ &#]+\/[^ &#]+)$/);
      ud = mr.exec(decodeURIComponent(content));
      if (ud && ud.length > 1 && 9 < ud[1].length && ud[1].length < 45 && ud[1].indexOf('/') !== -1 && ud[1].indexOf('10.') === 0) {
        meta.doi = ud[1];
      }
    }
    content = (await this.puppet(content));
  }
  if (typeof content !== 'string') {
    return {};
  }
  if (content.indexOf('<') !== 0 && content.length > 6000) {
    content = content.substring(0, 6000); // we only check the first three or so pages of content (3000 chars per page estimates 500 words per page)
  } else if (content.length > 50000) {
    content = content.substring(0, 50000); // but for apparently html or xml sorts of content, take more to get through all metadata
  }
  if (!meta.doi) {
    try {
      cl = content.toLowerCase();
      if (cl.indexOf('dc.identifier') !== -1) {
        cl = cl.split('dc.identifier')[1].split('content')[1];
        if (cl.indexOf('"') !== -1) {
          cl = cl.split('"')[1];
        }
        if (cl.indexOf("'") !== -1) {
          cl = cl.split("'")[1];
        }
        if (cl.indexOf('10.') === 0 && cl.indexOf('/') !== -1) {
          meta.doi = cl;
        }
      }
    } catch (error) {}
  }
  if (!meta.doi) {
    try {
      if (cl == null) {
        cl = content.toLowerCase();
      }
      if (cl.indexOf('citation_doi') !== -1) {
        cl = cl.split('citation_doi')[1].split('content')[1];
        if (cl.indexOf('"') !== -1) {
          cl = cl.split('"')[1];
        }
        if (cl.indexOf("'") !== -1) {
          cl = cl.split("'")[1];
        }
        if (cl.indexOf('10.') === 0 && cl.indexOf('/') !== -1) {
          meta.doi = cl;
        }
      }
    } catch (error) {}
  }
  if (!meta.doi) { // look for a doi in the first 600 words
    cnts = 0;
    ref = content.split(' ');
    for (j = 0, len = ref.length; j < len; j++) {
      str = ref[j];
      cnts += 1;
      if (cnts < 600) {
        str = str.replace(/ /g, '').replace('doi:', '');
        if (str.indexOf('doi.org') !== -1) {
          str = str.split('doi.org')[1];
        }
        if (str.indexOf('/') === 0) {
          str = str.replace('/', '');
        }
        str = str.trim();
        if (str.indexOf('10.') === 0 && str.indexOf('/') !== -1) { // don't use a regex
          meta.doi = str;
          break;
        }
      }
    }
  }
  if (!meta.doi) {
    try {
      d = (await this.tdm.extract({
        content: content,
        matchers: ['/doi[^>;]*?(?:=|:)[^>;]*?(10[.].*?\/.*?)("|\')/gi', '/doi[.]org/(10[.].*?/.*?)("| \')/gi']
      }));
      ref1 = d.matches;
      for (l = 0, len1 = ref1.length; l < len1; l++) {
        n = ref1[l];
        if (!meta.doi && 9 < d.matches[n].result[1].length && d.matches[n].result[1].length < 45) {
          meta.doi = d.matches[n].result[1];
          if (meta.doi.endsWith('.')) {
            meta.doi = meta.doi.substring(0, meta.doi.length - 1);
          }
        }
      }
    } catch (error) {}
  }
  if (meta.doi) { // catch some spacing issues that sometimes come through
    meta.doi = meta.doi.split(' ')[0];
  }
  if (!meta.title) {
    cl = content.toLowerCase();
    if (cl.indexOf('requestdisplaytitle') !== -1) {
      meta.title = cl.split('requestdisplaytitle').pop().split('>')[1].split('<')[0].trim().replace(/"/g, '');
    } else if (cl.indexOf('dc.title') !== -1) {
      meta.title = cl.split('dc.title')[1].replace(/'/g, '"').split('content=')[1].split('"')[1].trim().replace(/"/g, '');
    } else if (cl.indexOf('eprints.title') !== -1) {
      meta.title = cl.split('eprints.title')[1].replace(/'/g, '"').split('content=')[1].split('"')[1].trim().replace(/"/g, '');
    } else if (cl.indexOf('og:title') !== -1) {
      meta.title = cl.split('og:title')[1].split('content')[1].split('=')[1].replace('/>', '>').split('>')[0].trim().replace(/"/g, '');
      if (meta.title.startsWith("'")) {
        meta.title = meta.title.substring(1, meta.title.length - 1);
      }
    } else if (cl.indexOf('"citation_title" ') !== -1) {
      meta.title = cl.split('"citation_title" ')[1].replace(/ = /, '=').split('content="')[1].split('"')[0].trim().replace(/"/g, '');
    } else if (cl.indexOf('<title') !== -1) {
      meta.title = cl.split('<title')[1].split('>')[1].split('</title')[0].trim().replace(/"/g, '');
    }
  }
  if (meta.title && meta.title.indexOf('|') !== -1) {
    meta.title = meta.title.split('|')[0].trim();
  }
  if (!meta.year) {
    try {
      k = (await this.tdm.extract({
        content: content,
        matchers: ['/meta[^>;"\']*?name[^>;"\']*?= *?(?:"|\')citation_date(?:"|\')[^>;"\']*?content[^>;"\']*?= *?(?:"|\')(.*?)(?:"|\')/gi', '/meta[^>;"\']*?name[^>;"\']*?= *?(?:"|\')dc.date(?:"|\')[^>;"\']*?content[^>;"\']*?= *?(?:"|\')(.*?)(?:"|\')/gi', '/meta[^>;"\']*?name[^>;"\']*?= *?(?:"|\')prism.publicationDate(?:"|\')[^>;"\']*?content[^>;"\']*?= *?(?:"|\')(.*?)(?:"|\')/gi'],
        start: '<head',
        end: '</head'
      }));
      mk = k.matches[0].result[1];
      mkp = mk.split('-');
      if (mkp.length === 1) {
        meta.year = mkp[0];
      } else {
        for (o = 0, len2 = mkp.length; o < len2; o++) {
          my = mkp[o];
          if (my.length > 2) {
            meta.year = my;
          }
        }
      }
    } catch (error) {}
  }
  if (!meta.keywords) {
    try {
      k = (await this.tdm.extract({
        content: content,
        matchers: ['/meta[^>;"\']*?name[^>;"\']*?= *?(?:"|\')keywords(?:"|\')[^>;"\']*?content[^>;"\']*?= *?(?:"|\')(.*?)(?:"|\')/gi'],
        start: '<head',
        end: '</head'
      }));
      kk = k.matches[0].result[1];
      if (kk.indexOf(';') !== -1) {
        kk = kk.replace(/; /g, ';').replace(/ ;/g, ';');
        meta.keywords = kk.split(';');
      } else {
        kk = kk.replace(/, /g, ',').replace(/ ,/g, ',');
        meta.keywords = kk.split(',');
      }
    } catch (error) {}
  }
  if (!meta.email) {
    mls = [];
    try {
      m = (await this.tdm.extract({
        content: content,
        matchers: ['/mailto:([^ \'">{}/]*?@[^ \'"{}<>]*?[.][a-z.]{2,}?)/gi', '/(?: |>|"|\')([^ \'">{}/]*?@[^ \'"{}<>]*?[.][a-z.]{2,}?)(?: |<|"|\')/gi']
      }));
      ref2 = m.matches;
      for (p = 0, len3 = ref2.length; p < len3; p++) {
        i = ref2[p];
        mm = i.result[1].replace('mailto:', '');
        if (mm.endsWith('.')) {
          mm = mm.substring(0, mm.length - 1);
        }
        if (mls.indexOf(mm) === -1) {
          mls.push(mm);
        }
      }
    } catch (error) {}
    mls.sort((function(a, b) {
      return b.length - a.length;
    }));
    mstr = '';
    meta.email = [];
    for (q = 0, len4 = mls.length; q < len4; q++) {
      me = mls[q];
      if (mstr.indexOf(me) === -1) {
        meta.email.push(me);
      }
      mstr += me;
    }
  }
  return meta;
};


S.built = "Fri May 14 2021 13:21:20 GMT+0100";
S.system = "eeb98ca9cdfdad899c74e9f492c3c85cb185b58e8f2b42e0adebb35b8d847045";
P.convert._gz2txt = {_bg: true}// added by constructor

P.convert._excel2 = {}// added by constructor

P.convert.file2txt = {}// added by constructor

P.puppet = {_bg: true}// added by constructor

P.scripts.testoab = {_bg: true}// added by constructor

P.src.crossref._load = {_bg: true}// added by constructor
