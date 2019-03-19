"use strict";

// Let's pollute global for simplicity.
var a = rhh.a;
var br = rhh.br;
var div = rhh.div;
var h = rhh.h;
var h2 = rhh.h2;
var span = rhh.span;

const Plot = createPlotlyComponent(Plotly);
//const Plot = plotComponentFactory(Plotly);

console.log("before ShotsApp class declaration.");

//const rootContainer = document.querySelector('#root');

/** Top-level for Shots app. Everything starts and ends here. Only create once. */
class ShotsApp extends React.Component {
  constructor(props) {
    // Default props.
    if (props.enableLocalStorage === undefined) {
      props = {...props, enableLocalStorage: false};
    }
    /* Props:
     * enableLocalStorage
     */
    super(props);
    
    // State we might change but shouldn't be used with setState().
    this.shotStorage = new GapiShotStorage(GapiWrapper, new ShotCodec()); 

    // this bindings.
    this.route = this.route.bind(this);
    this.toggleOptions = this.toggleOptions.bind(this);
    
    // Top-level events.
    window.addEventListener('hashchange', this.route, false);

    // The heart of the app.
    this.state = {
      defaultHashPrefix: '#',
      debugMessage: '',
      showOptions: false,
    };
  }
  
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
    }

    this.setState(nextState);
  }
  
  async routeList(nextState) {
    let [shots, continuationToken] = await this.shotStorage.listShots({parentIds: [...nextState.parentFilterSet]}, {});
    nextState.listData = shots;
  }
  async routeSingle(nextState) {
    let shot = await this.shotStorage.getShot(nextState.shotFileId);
    nextState.shotData = shot;
  }
  
  static _showRelativeMenuControls(view) {
    // Maintain list of views that can have relative controls.
    return view === 'single';
  }
  
  render() {
    var children = [];
    children.push([
      h(ShotsMenu, {
        defaultHashPrefix: this.state.defaultHashPrefix,
        shotFileId: this.state.shotFileId,
        toggleOptions: this.toggleOptions,
        showRelative: ShotsApp._showRelativeMenuControls(this.state.view),
      }),
      br(),
    ]);
    
    if (this.state.showOptions) {
      children.push(h(ShotsOptionsBar), br());
    }
    
    // TODO: debug remove
    children.push(h2(`message of the day: ${this.state.debugMessage}`));
    
    if (this.state.view === 'list') {
      children.push(
        h(ShotsList, {
          defaultHashPrefix: this.state.defaultHashPrefix,
          listData: this.state.listData,
          // TODO: callback to request more list
        }));
    } else if (this.state.view === 'single') {
      children.push(
        h(SingleShotView, {
          shotData: this.state.shotData,
        }),
      );
    }
    
    return children;
  }

}


class ShotsMenu extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    var prefix = this.props.defaultHashPrefix; // e.g. #apiKey=asdf&
    var shotFileIndexParam = 'shot_file_id=' + this.props.shotFileId;
    var children = [
      // Left side: Navigation.
      a('.menu-item', {href: prefix + 'view=list'}, 'shots'),
      a('.menu-item', {href: prefix + 'redirect=absolute_index&absolute_index=-1'}, 'last'),
      a('.menu-item', {href: prefix + 'redirect=yesterday'}, 'yesterday'),
      a('.menu-item', {href: prefix + 'redirect=absolute_index&absolute_index=0'}, 'first'),
    ];
    
    if (this.props.showRelative) {
      children.push(
        // Relative-to-current-shot navigation.
        a('.menu-item', {href: prefix + 'redirect=relative_index&relative_index=-10&' + shotFileIndexParam}, '-10'),
        a('.menu-item', {href: prefix + 'redirect=relative_index&relative_index=-1&' + shotFileIndexParam}, '-1'),
        a('.menu-item', {href: prefix + 'redirect=relative_index&relative_index=1&' + shotFileIndexParam}, '+1'),
      );
    }
    
    children.push(
      // Right side: Options toggle.
      a('.options-nav', {onClick: this.props.toggleOptions}, '\u00B7\u00B7\u00B7'),
    );
    
    return div(".menu-bar", children);
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
  constructor(props) {
    super(props);
  }
  render() {
    if (this.props.listData === undefined) {
      return [];
    }
    let lastDate = new Date(0);
    let lastDateCount = 0;
    let listDataWithDailyCount = this.props.listData
      .reduceRight((wrappers, shot) => {
        if (lastDate.toDateString() !== shot.date.toDateString()) {
          lastDate = shot.date;
          lastDateCount = 0;
        }
        let dailyCount = ++lastDateCount;
        wrappers.push({
          shot: shot,
          dailyCount: dailyCount,
        });
        return wrappers;
      },
      [])
      .reverse();
    let children = listDataWithDailyCount
      .map(
        ({shot, dailyCount}) => h(ShotsListEntry, {
          dailyCount: dailyCount,
          defaultHashPrefix: this.props.defaultHashPrefix,
          shot: shot,
        }));
    return children;
  }
}

class ShotsListEntry extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    let shotLocation = this.props.defaultHashPrefix + `view=single&shot_file_id=${this.props.shot.id}`;
    let formattedDate = moment(this.props.shot.date).format(`ddd MMM DD gggg (#${this.props.dailyCount}) HH:mm:ss ZZ`);
    let shotTitle = formattedDate;
    // TODO: this probably outputs a double '/' if child of root.
    let shotDetails = `${this.props.shot.parent.path}/${this.props.shot.name}`;
    return div('.shots-list-entry', [
      div('.shots-list-entry-title', [a({href: shotLocation}, shotTitle)]),
      div('.shots-list-entry-details', [a({href: shotLocation}, shotDetails)]),
    ]);
  }
}

class SingleShotView extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    return div([
      h(SingleShotGraph, {
        shotData: this.props.shotData,
      }),
      // TODO: metadata
    ]);
  }
}

class SingleShotGraph extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    var shotData = this.props.shotData;
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



//ReactDOM.render(h(ShotsApp), rootContainer);
