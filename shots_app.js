"use strict";

// // React aliases.
// var a = rhh.a;
// var br = rhh.br;
// var button = rhh.button;
// var div = rhh.div;
// var h = rhh.h;
// var h2 = rhh.h2;
// var span = rhh.span;

// // React Router aliases.
// const Router = window.ReactRouterDOM.HashRouter;
// const Route =  window.ReactRouterDOM.Route;
// const Link =  window.ReactRouterDOM.Link;
// const withRouter = window.ReactRouterDOM.withRouter;
// //const Prompt =  window.ReactRouterDOM.Prompt;
// //const Switch = window.ReactRouterDOM.Switch;
// //const Redirect = window.ReactRouterDOM.Redirect;

// const connect = window.ReactRedux.connect;
// const Provider = window.ReactRedux.Provider;


// const createStore = window.Redux.createStore;
// const combineReducers = window.Redux.combineReducers;


// const Plot = createPlotlyComponent(Plotly);
//const Plot = plotComponentFactory(Plotly);

console.log("before ShotsApp class declaration.");

//const rootContainer = document.querySelector('#root');

/** Top-level for Shots app. Everything starts and ends here. Only create once. */
class ShotsApp extends React.Component {
  // constructor(props) {
    // // Default props.
    // if (props.enableLocalStorage === undefined) {
      // props = {...props, enableLocalStorage: false};
    // }
    // /* Props:
     // * enableLocalStorage
     // */
    // super(props);
    
    // // State we might change but shouldn't be used with setState().
    // // this.shotSerializer = new ShotSerializer();
    // // this.shotStorage = new GapiShotStorage(GapiWrapper, new ShotCodec()); 

    // // this bindings.
    // this.route = this.route.bind(this);
    // this.requestShotSharingLink = this.requestShotSharingLink.bind(this);
    // this.toggleOptions = this.toggleOptions.bind(this);
    
    // // Top-level events.
    // window.addEventListener('hashchange', this.route, false);

    // // The heart of the app.
    // this.state = {
      // defaultHashPrefix: '#',
      // debugMessage: '',
      // showOptions: false,
    // };
  // }
  
  
  toggleOptions() {
    this.setState({
      showOptions: !this.state.showOptions,
    });
  }
  
  _putIntoLocalStorage(localStorageOverrides) {
    var locallyStored = [];
    Object.keys(localStorageOverrides).forEach(key => {
      try {
        window.localStorage.setItem(key, localStorageOverrides[key]);
      } catch (e) {
        // Treat any error as a non-fatal failure, and move on.
        console.log(`Unable to put ${key}=${localStorageOverrides[key]} into localStorage. Reason: ${e}`);
        return;
      }
      locallyStored.push(key);
    });
    return locallyStored;
  }
  
  _paramsToHashLocation(params) {
    var hashLocation = '#' +
      Object.keys(params)
        .filter(key => params[key] !== undefined)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');
    return hashLocation;
  }
  
  /** Dupe of _paramsToHashLocation but adds trailing &. Otherwise arg list would be weird. */
  _paramsToHashLocationWithTrailingSeparator(params) {
    var hashLocation = '#' +
      Object.keys(params)
        .filter(key => params[key] !== undefined)
        .map(key => `${key}=${encodeURIComponent(params[key])}`)
        .join('&');
    if (hashLocation.length > 1) {
      hashLocation = hashLocation + '&';
    }
    return hashLocation;
  }
  
  _getPersistentParams(state) {
    var params = {};
    if (!this.props.enableLocalStorage) {
      // TODO: centralize code for persistent params.
      params.api_key = state.apiKey;
      params.client_id = state.clientId;
    }
    params.parent_filter_set = (state.parentFilterSet.size === 0) ? undefined : [...state.parentFilterSet].join(',');
    return params;
  }
  
  _replaceLocation(params) {
    // Make new location and use it as replacement.
    window.history.replaceState(null, null, this._paramsToHashLocation(params));
  }
  
  _removeParamsFromLocation(params, locallyStored) {
    // Mutate params.
    locallyStored.forEach(key => {
      params[key] = undefined;
    });

    this._replaceLocation(params);
  }

  /** May mutate params. */
  _updateStateWithLocation(nextState, params) {
    // Deal with inputs related to state persistent outside of params.
    var persistentInputs = [
      // state key, params/persistent key.
      ['apiKey', 'api_key'],
      ['clientId', 'client_id'],
    ];
    
    var localStorageOverrides = {};
    persistentInputs.forEach(([stateKey, paramsKey]) => {
      // First grab from localStorage.
      if (this.props.enableLocalStorage) {
        nextState[stateKey] = window.localStorage.getItem(paramsKey);
      }
      // Params override localStorage.
      if (params[paramsKey] !== undefined) {
        localStorageOverrides[paramsKey] = params[paramsKey];
        nextState[stateKey] = params[paramsKey];
      }
    });
    // Attempt to put back into localStorage if changed, and remove from location.
    if (this.props.enableLocalStorage) {
      var locallyStored = this._putIntoLocalStorage(localStorageOverrides);
      if (locallyStored.length > 0) {
        this._removeParamsFromLocation(params, locallyStored);
      }
    }
    
    // Ephemeral inputs.
    var ephemeralInputs = [
      // state key, params key, optional processing step.
      ['parentFilterSet', 'parent_filter_set', parent_filter_set => new Set(parent_filter_set.split(','))],
      ['view', 'view'],
      ['shotFileId', 'shot_file_id'],
      ['redirect', 'redirect'],
      ['absoluteIndex', 'absolute_index', absolute_index => Math.floor(absolute_index)],
      ['relativeIndex', 'relative_index', relative_index => Math.floor(relative_index)],
      ['byoAlias', 'byo_alias'],
      ['compressedShotData', 'shot_data'],
    ]
    
    ephemeralInputs.forEach(([stateKey, paramsKey, process]) => {
      var value = params[paramsKey];
      if (process !== undefined && value !== undefined) {
        value = process(value);
      }
      nextState[stateKey] = value;
    });
    
    // Exceptions.
    if (nextState.parentFilterSet === undefined) {
      nextState.parentFilterSet = new Set();
    }
    
    // Derived state.
    nextState.defaultHashPrefix = this._paramsToHashLocationWithTrailingSeparator(
      this._getPersistentParams(nextState));
  }
  
  /** Takes care of dynamic redirects. Responsible for replacing location and triggering re-route. */
  async _redirect(nextState) {
    // await GapiWrapper.ensureApiKeyAndClientIdAuthed(nextState.apiKey, nextState.clientId);
    // await this.shotStorage.listShots({}, {});
    let view;
    let nextShotFileId;
    var nextParams = this._getPersistentParams(nextState);
    
    switch (nextState.redirect) {
      case 'absolute_index': {
        if (nextState.absoluteIndex < 0) {
          // Index from end means get descending list.
          let numResultsRequired = Math.abs(nextState.absoluteIndex); // e.g. -n means we need nth result from descending list.
          let [shots] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet]}, {numResults: numResultsRequired});
          let index = (shots.length < numResultsRequired) ? shots.length - 1 : numResultsRequired - 1;
          nextShotFileId = shots[index].id;
        } else {
          // Index from start means get ascending list.
          let numResultsRequired = nextState.absoluteIndex + 1; // e.g. (0-indexed) n means we need (1-indexed) n+1th result from ascending list.
          let [shots] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet]}, {order: 'asc', numResults: numResultsRequired});
          let index = (shots.length < numResultsRequired) ? shots.length - 1 : numResultsRequired - 1;
          nextShotFileId = shots[index].id
        }
        view = 'single';
        break;
      }

      case 'relative_index': {
        // For relative index we'll do a vanilla descending list and adjust as needed.
        // Required parameters.
        let currentShotFileId = nextState.shotFileId;
        let relativeIndex = nextState.relativeIndex;
        if (currentShotFileId === undefined || relativeIndex === undefined) {
          break; // Default redirect.
        }
        
        let allShots = [];
        let shots;
        let continuationToken;
        let currentShotIndex;
        do {
          // Searching phase.
          [shots, continuationToken] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet]}, {}, continuationToken);
          currentShotIndex = shots.findIndex(shot => shot.id === currentShotFileId);
          if (currentShotIndex !== -1) {
            // Found.
            break;
          }
          // Not found. Do another round.
          allShots.push(...shots); // Store history for lookback.
          continue;          
        } while (continuationToken !== undefined);
        
        if (currentShotIndex === -1) {
          // Could not find. Default.
          break;
        }
        
        // Found current shot.
        if (relativeIndex > 0) {
          // Indexing forward in time, so backward through results.
          if (relativeIndex <= currentShotIndex) {
            nextShotFileId = shots[currentShotIndex - relativeIndex].id;
          } else if (allShots.length > 0) {
            // Need to go through rest of shots.
            relativeIndex -= currentShotIndex + 1; // Space between reference and target. n means nth result from end of allShots.
            let allShotsIndex = allShots.length - 1 - relativeIndex;
            if (allShotsIndex < 0) {
              allShotsIndex = 0;
            }
            nextShotFileId = allShots[allShotsIndex].id;
          } else {
            // Special case: no allShots buffer, just pick first result of current list.
            nextShotFileId = shots[0].id;
          }
        } else {
          // Indexing backward in time, so forward through results.
          relativeIndex = Math.abs(relativeIndex);
          if (currentShotIndex + relativeIndex < shots.length) {
            // Results available.
            nextShotFileId = shots[currentShotIndex + relativeIndex].id;
          } else {
            // Results unavailable. Request the minimum required.
            let numResultsRequired = relativeIndex - (shots.length - currentShotIndex) + 1;
            [shots] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet]}, {numResults: numResultsRequired}, continuationToken);
            if (shots.length < numResultsRequired) {
              // Index too big. Use last file.
              numResultsRequired = shots.length;
            }
            nextShotFileId = shots[numResultsRequired-1].id;
          }
        }
        view = 'single';
        break;
      }
      
      case 'yesterday': {
        // Do this more reusably.
        const H_TO_M = 60;
        const M_TO_S = 60;
        const S_TO_MS = 1000;
        let dateYesterday = new Date(Date.now() - (24 * H_TO_M * M_TO_S * S_TO_MS));
        // e.g. 20190303
        let yesterday = dateYesterday.getFullYear() +
          ("0" + (dateYesterday.getMonth()+1)).slice(-2) +
          ("0" + dateYesterday.getDate()).slice(-2);
        let [shots] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet], latest: yesterday}, {numResults: 1});
        if (shots.length === 0) {
          break;
        }
        view = 'single';
        nextShotFileId = shots[0].id;
        break;
      }
        
      default: {
        view = 'list';
        break;
      }
    }
    
    if (view === undefined) {
      view = 'list'; // Default to list.
    }
    
    nextParams.view = view;
    // TODO: find a better way to organize this.
    if (view === 'single') {
      nextParams.shot_file_id = nextShotFileId;
    }
    this._replaceLocation(nextParams);
    return this.route(); // Reroute.
  }

  /**
   * Takes care of location routing.
   * Routing may invoke RPCs and delay updating state. This will be preferred over letting sub-components call RPCs based on props changes.
  */
  async route() {
    var nextState = {};
    nextState.debugMessage = window.location.href;
    
    // Turn href into nextState.
    var params = url('#');
    if (params === undefined) {
      params = {};
    }
    this._updateStateWithLocation(nextState, params);
    
    // Fan-out auth.
    this.shotStorage.setApiKey(nextState.apiKey);
    this.shotStorage.setClientId(nextState.clientId);
    
    // Redirect processing.
    if (nextState.redirect !== undefined) {
      return this._redirect(nextState);
    }
    
    // View processing.
    // Default is listing.
    if (nextState.view === undefined) {
      nextState.view = 'list';
    }
    
    if (nextState.view === 'list') {
      await this.routeList(nextState);
      
    } else if (nextState.view === 'single') {
      await this.routeSingle(nextState);

    } else if (nextState.view === 'byo_single') {
      // TODO: route this!!!!
      this.routeByoSingle(nextState);
    }

    this.setState(nextState);
  }
  
  async routeList(nextState) {
    let [shots, continuationToken] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet]}, {});
    nextState.listData = shots;
  }
  async routeSingle(nextState) {
    // TODO: need to make sure we only go here if we are switching to a shot. not for temporary things done on the same page.
    //       Maybe a sophisticated router is necessary.
    let shot = await this.shotStorage.getShot(nextState.shotFileId);
    nextState.shotData = shot;
    nextState.shotSharingLinkGetSuccess = undefined;
    nextState.shotSharingLink = undefined;
  }
  routeByoSingle(nextState) {
    try {
      let shotData = this.shotSerializer.deserializeFromUri(nextState.compressedShotData);
    } catch (e) {
      console.log("Error decoding shot. Reason: " + e);
    }
    nextState.shotData = shotData;
    nextState.byoAlias = nextState.byoAlias;
  }
  
  static _showRelativeMenuControls(view) {
    // Maintain list of views that can have relative controls.
    return view === 'single';
  }
  

  
  
  async requestShotSharingLink(shotData) {
    let readyForUri = this.shotSerializer.serializeForUri(shotData);
    
    // Get url up to hash
    let hashQueryStart = window.location.href.indexOf('#');
    if (hashQueryStart === -1) {
      hashQueryStart = window.location.href.length;
    }
    let uriBase = window.location.href.substring(0, hashQueryStart);
    
    let alias = encodeURIComponent(shotData.filename) + '-' + uuidv4();
    let tinyUrl = `https://tinyurl.com/${alias}`;
    
    // byo_single params.
    let params = {
      view: 'byo_single',
      byo_alias: tinyUrl, // Optimistically put it here since we can't figure out the sharing link otherwise.
      shot_data: readyForUri,
    };
    let uri = uriBase + this._paramsToHashLocation(params);

    // Request short link.
    // e.g. https://tinyurl.com/create.php?source=&url=http%3A%2F%2Fgoogle.com%2Fhelloworld&submit=Make+TinyURL%21&alias=
    //let requestUrl = `https://tinyurl.com/create.php?source=&url=${encodeURIComponent(uri)}&submit=Make+TinyURL%21&alias=${alias}`;
    //let requestUrl = `https://tinyurl.com/create.php?alias=${alias}`; // api-create.php does not support parameter 'alias'.
//    let requestUrl = `https://tinyurl.com/api-create.php`; // api-create.php does not support parameter 'alias'.
//    let requestUrl = `https://slink.be/one.php`;
    //let requestUrl = `https://bitly.com/data/shorten`;
    //let requestUrl = 'https://is.gd/create.php';
    // let requestUrl = 'https://is.gd/create.php?url=${encodeURIComponent(uri)}';
    // let requestUrl = `https://git.io/create`;
    // let requestUrl = 'http://gg.gg/create';
    
    // uri = window.location.href;    
    // let requestUrl = `http://shorl.com/create.php?url=${encodeURIComponent(uri)}&go=Shorlify%21`;
    
    let xhr = await new Promise(resolve => {
      let xhr = new XMLHttpRequest();
      // xhr.open("POST", requestUrl, true);
      xhr.open("GET", requestUrl, true);
      // xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
      //xhr.responseType = 'json';
      //xhr.overrideMimeType('text/plain');
      xhr.onreadystatechange = function() {
        if (this.readyState === XMLHttpRequest.DONE) {
          resolve(this);
        }
      };
      // xhr.send(`url=${encodeURIComponent(uri)}`);
      //xhr.send(`url=${encodeURIComponent(uri)}&submit=Create`);
      //xhr.send(`url=${encodeURIComponent(uri)}`);
      //xhr.send(`format=xml&url=${encodeURIComponent(uri)}`);
      // xhr.send(`custom_path=&use_norefs=0&long_url=${encodeURIComponent(uri)}&app=site&version=0.1`);
      xhr.send();
    });
    
    
    // xhr.responseType = 'json';
    // xhr.open("POST", getRefreshTokenUri, true);
    // xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

    // xhr.onreadystatechange = function() {
      // if (this.readyState === XMLHttpRequest.DONE) {
        // resolve(this);
      // }
    // }
    // xhr.send(
      // `code=${authCode}&` +
      // `client_id=${clientId}&` +
      // `client_secret=${clientSecret}&` +
      // `redirect_uri=${REDIRECT_URI}&` +
      // `grant_type=authorization_code`);
    
    // We good. Assume the alias works.
    console.log(xhr);
    this.setState({
      shotSharingLinkGetSuccess: xhr.status === 200,
      shotSharingLink: tinyUrl,
    });
  }
  
  render() {
    var children = [];
    // children.push(
      // h(ShotsMenu, {
        // defaultHashPrefix: this.state.defaultHashPrefix,
        // shotFileId: this.state.shotFileId,
        // toggleOptions: this.toggleOptions,
        // showRelative: ShotsApp._showRelativeMenuControls(this.state.view),
      // }),
      // br(),
    // );
    
    // if (this.state.showOptions) {
      // children.push(h(ShotsOptionsBar), br());
    // }
    
    // Redirect route
    children.push(
      h(Route, {path: '/redirect/from/personal/:provider/:shotId/:relativeIndex', component: RedirectRelativeFromPersonal}),
      h(Route, {path: '/redirect/index/personal/:provider/:index', component: RedirectWithAbsoluteIndex}),
      h(Route, {path: '/redirect/yesterday', component: RedirectYesterday}),
      );
    
    children.push(
      h(RoutedShotsMenu));
      
    children.push(
      h(Route, {path: '/auth', component: RoutedAuthSettings}));
    
    children.push(
      h(Route, {exact: true, path: '/', component: RoutedShotsList}));
      
    children.push(
      h(Route, {path: '/personal/:provider/:shotId', component: RoutedSingleShotView}));
      
    // BYO version of single shot view.
    children.push(
      h(Route, {path: '/public/binary/:shortUrl/:serializedShot', component: RoutedByoSingleShotView}));
    
    // if (this.state.view === 'list') {
      // children.push(
        // h(ShotsList, {
          // defaultHashPrefix: this.state.defaultHashPrefix,
          // listData: this.state.listData,
          // // TODO: callback to request more list
        // }));
    // } else if (this.state.view === 'single') {
      // children.push(
        // h(SingleShotView, {
          // // TODO: get the data here, or get it before render?
          // byo: (this.state.view === 'byo_single'),
          // byoAlias: this.state.byoAlias,
          // requestLink: this.requestShotSharingLink.bind(this, this.state.shotData),
          // shotData: this.state.shotData,
          // shotSharingLink: this.state.shotSharingLink,
          // shotSharingLinkGetSuccess: this.state.shotSharingLinkGetSuccess,
        // }),
      // );
    // }
    
    // // Testing router.
    // children.push(
      // h(Router, [
        // h2('React Router Testing'),
        // h(Link, {to: "/"}, 'Home'),
             // br(),
        // h(Link, {to: "/about"}, 'About'),
        // br(),
        // h(Link, {to: "/about/1zmeHEIcVYsrBCtB7HB-HY2bmZe0qC8kT"}, 'About a shot'),
        // br(),
        // h(Link, {to: "/about/azAZ09-_.%2525"}, 'About base64'),
        
        
        // h(Route, {path: "/", exact: true, component: BootyA, ...this.state}),
        // h(Route, {path: "/about/:shotId", exact: true, component: BootyB}),
      // ]));

    return children;
  }
}

(function(ns = window) {
  class AuthSyncedShotsApp extends React.Component {
    constructor(props) {
      super(props);
      // TODO: move this somewhere else. constructor is not supposed to have side-effects.
      this.setAuth();
    }
    setAuth() {
      this.props.setAuth(this.props.auth.clientId, this.props.auth.clientSecret, this.props.auth.refreshToken);
    }
    // TODO: does not work for setting auth because it executes in post traversal order.
    // So it will occur after Routes.
    // componentDidMount() {
    // }

    componentDidUpdate(prevProps) {
      // if (this.props.auth.apiKey !== prevProps.auth.apiKey || this.props.auth.clientId !== prevProps.auth.clientId) {
      if (this.props.auth.clientId !== prevProps.auth.clientId || this.props.auth.clientSecret !== prevProps.auth.clientSecret
          || this.props.auth.refreshToken !== prevProps.auth.refreshToken) {
        this.setAuth();
      }
    }

    render() {
      return h(ShotsApp, {...this.props});
    }
  }
  
  const getAuth = (stateAuth) => {
    return {...stateAuth};
  };

  const mapStateToProps = (state) => ({
    auth: getAuth(state.auth),
  });
  
  const mapDispatchToProps = (dispatch, ownProps) => ({
    setAuth: (clientId, clientSecret, refreshToken) => dispatch(setAuth(clientId, clientSecret, refreshToken)),
  });
  
  ns.AuthSyncedShotsApp = withRouter(connect(
    mapStateToProps,
    mapDispatchToProps,
  )(AuthSyncedShotsApp));

})();

class ShotsMenu extends React.Component {
  render() {
    var children = [];

    var mainMenuChildren = [
      // Left side: Navigation.
      h(Link, '.menu-item', {to: '/'}, 'shots'),
      h(Link, '.menu-item', {to: '/redirect/index/personal/drive/-1'}, 'last'),
      h(Link, '.menu-item', {to: '/redirect/yesterday'}, 'yesterday'),
      h(Link, '.menu-item', {to: '/redirect/index/personal/drive/0'}, 'first'),
    ];
    mainMenuChildren.push(
      h(Route, {path: '/personal/:provider/:shotId', render: ({match: {params: {provider, shotId}}}) => [
        h(Link, '.menu-item', {to: `/redirect/from/personal/${provider}/${shotId}/-10`}, '-10'),
        h(Link, '.menu-item', {to: `/redirect/from/personal/${provider}/${shotId}/-1`}, '-1'),
        h(Link, '.menu-item', {to: `/redirect/from/personal/${provider}/${shotId}/1`}, '+1'),
      ]}),
    );
    mainMenuChildren.push(
      // Right side: Options toggle.
      a('.options-nav', {onClick: this.props.toggleOptionsMenu}, '\u00B7\u00B7\u00B7'),
    );
    
    children.push(
      div('.menu-bar', mainMenuChildren),
    );
    
    if (this.props.options.menu.show) {
      children.push(
        div([
          h(Link, '.option-item', {to: '/auth'}, 'Auth settings'),
        ]),
      );
    }
    
//    return div(".menu-bar", children);
    return children;
  }
}

class ShotsOptionsBar extends React.Component {
  constructor(props) {
    super(props);
  }
  
  render() {
    var children = [];
    
    // Put a shotindex selection on hold.
    // this.props.request
           // <span class="odd-option">
        // <select id="shotindex-select"></select>
        // <button id="shotindex-switch-button" type="button">Switch</button>
      // </span>
      // <span class="even-option">goodbye</span>

    children.push(
      h2('hello world'));

    return div({style: {display: 'flex'}}, children);
  }
}

class ShotsList extends React.Component {
  // constructor(props) {
    // super(props);
  // }
  render() {
    if (this.props.shots.list === undefined) {
      return [];
    }
    let lastDate = new Date(0);
    let lastDateCount = 0;
    let listDataWithDailyCount = this.props.shots.list
      .reduceRight((wrappers, shotId) => {
        let shot = this.props.shots.db[shotId];
        if (lastDate.toDateString() !== shot.date.toDateString()) {
          lastDate = shot.date;
          lastDateCount = 0;
        }
        let dailyCount = ++lastDateCount;
        wrappers.push({
          shotId: shotId,
          dailyCount: dailyCount,
        });
        return wrappers;
      },
      [])
      .reverse();
    let children = listDataWithDailyCount
      .map(
        ({shotId, dailyCount}) => h(ShotsListEntry, {
          dailyCount: dailyCount,
          // defaultHashPrefix: this.props.defaultHashPrefix,
          shot: this.props.shots.db[shotId],
        }));
    return children;
  }
}

class ShotsListEntry extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    //let shotLocation = this.props.defaultHashPrefix + `view=single&shot_file_id=${this.props.shot.id}`;
    // TODO: keep filters.
    let shotLocation = `/personal/drive/${this.props.shot.id}`;
    
    let formattedDate = moment(this.props.shot.date).format(`ddd MMM DD gggg (#${this.props.dailyCount}) HH:mm:ss ZZ`);
    let shotTitle = formattedDate;
    // TODO: this probably outputs a double '/' if child of root.
    let shotDetails = `${this.props.shot.parent.path}/${this.props.shot.name}`;
    return div('.shots-list-entry', [
      div('.shots-list-entry-title', [h(Link, {to: shotLocation}, shotTitle)]),
      div('.shots-list-entry-details', [h(Link, {to: shotLocation}, shotDetails)]),
    ]);
  }
}

class SingleShotView extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    let children = [];
    children.push(
      h(SingleShotGraph, {
        shotData: this.props.shot,
      }));
    
    if (!this.props.byo) {
      // Data from shot storage. Allow sharing.
      // Turning off sharing until the implementation is solved.
      children.push(
        h(ShotSharingWidget));
    } else {
      // Bring your own data. Show link instead.
      children.push(
        h3('.normal-text', 'Share link: '),
        h3('.normal-link', decodeURIComponent(this.props.match.params.shortUrl)),
      );
    }
    // TODO: metadata
    return children;
  }
}

class SingleShotGraph extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    var shotData = this.props.shotData;
    if (shotData === undefined || shotData.lastFetched === undefined) {
      return [];
    }
    var pressure = {
      x: shotData.elapsed,
      y: shotData.pressure,
      mode: 'lines',
      name: 'Pressure',
      line: {
        color: 'green'
      }
    };
    var flow = {
      x: shotData.elapsed,
      y: shotData.flow,
      mode: 'lines',
      name: 'Flow',
      line: {
        color: 'blue'
      },
      yaxis: 'y2'
    };
    var temperatureBasket = {
      x: shotData.elapsed,
      y: shotData.temperatureBasket,
      mode: 'lines',
      name: 'Basket Temperature',
      line: {
        color: 'red'
      },
      yaxis: 'y3'
    };

    // Pressure and flow ranges match DE app defaults.
    var pressureRange = [0, 12];
    var flowRange = [0, 6];
    
    // Align temperature domain such that temperature target is centered.
    var center =
        shotData.temperatureTarget.reduce(
          (accumulator, currentValue) => accumulator + currentValue)
        / shotData.temperatureTarget.length;
    var maxDifference = [...Array(shotData.elapsed.length).keys()]
        .map(
          (index) => Math.max(Math.abs(shotData.temperatureTarget[index] - center), Math.abs(shotData.temperatureBasket[index] - center)))
        .reduce((accumulator, currentValue) => Math.max(accumulator, currentValue), 0);
    var temperatureRange = [center - maxDifference, center + maxDifference];
    var temperatureTarget = {
      x: shotData.elapsed,
      y: shotData.temperatureTarget,
      mode: 'lines',
      name: 'Target Basket Temperature',
      line: {
        color: 'red',
        dash: 'dash'
      },
      yaxis: 'y3'
    };
      
    var data = [pressure, flow, temperatureBasket, temperatureTarget];
    var layout = {
      titlefont: {
        family: 'Roboto',
      },
      title: `Shot @ ${shotData.timestamp}`,
//             showlegend: false,
      xaxis: {
        title: 'Elapsed (s)',
        domain: [0, 0.9],
      },
      yaxis: {
        title: 'Pressure (bar)',
        titlefont: {color: 'green'},
        tickfont: {color: 'green'},
        side: 'left',
        autorange: false,
        range: pressureRange,
      },
      yaxis2: {
        title: 'Flow (mL/s)',
        titlefont: {color: 'blue'},
        tickfont: {color: 'blue'},
        anchor: 'x',
        overlaying: 'y',
        side: 'right',
        autorange: false,
        range: flowRange,
      },
      yaxis3: {
        title: 'Basket Temperature (C)',
        titlefont: {color: 'red'},
        tickfont: {color: 'red'},
        anchor: 'free',
        overlaying: 'y',
        side: 'right',
        position: 1,
        autorange: false,
        range: temperatureRange
      },
    };
    // React overwrites any existing plot.
    // Plotly.react(plot, data, layout);
    
    return h(Plot, '.single-shot-plot', {
      data: data,
      layout: layout,
    });
  }
}    

// Validation function objects should be static. https://github.com/erikras/redux-form/issues/2629
const required = value => (value || typeof value === 'number' ? undefined : 'Required');
const renderField = ({
  input,
  label,
  type,
  meta: {touched, error},
}) => {
  return div([
    rhh.label(label),
    div([
      rhh.input({...input, placeholder: label, type: type}),
      ...((touched && error) ? [span(error)] : []),
    ]),
  ]);
};

class AuthSettings extends React.Component {
  render() {
// const AuthSettings = ({onPurge, onSubmit, submitting}) => {
  // const clientId = this.props.auth.clientId !== undefined ? this.props.auth.clientId : '';
  // const clientSecret = this.props.auth.clientSecret !== undefined ? this.props.auth.clientSecret : '';
  // const refreshToken = this.props.auth.refreshToken !== undefined ? this.props.auth.refreshToken : '';
  
    let {handleSubmit, onPurge, onSubmit, submitting} = this.props;
    
    
    
    let children = [];
    
    children.push(
      form({onSubmit: handleSubmit}, [
        h(Field, {name: 'clientId', label: 'Client ID', component: renderField, type: 'text', validate: required}),
        h(Field, {name: 'clientSecret', label: 'Client Secret', component: renderField, type: 'text', validate: required}),
        h(Field, {name: 'refreshToken', label: 'Refresh Token', component: renderField, type: 'text', validate: required}),
        div([
          button({type: 'submit', disabled: submitting}, "Set"),
        ]),
      ]),
      button({onClick: onPurge}, 'Purge Auth'),
    );

    return children;
  }
}
// };
  // }
// }

//ReactDOM.render(h(ShotsApp), rootContainer);
