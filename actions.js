'use strict';

// Auth.
const applyAuth = createAction("APPLY_AUTH");
const checkingAuth = createAction("CHECKING_AUTH");
const confirmAuthValidity = createAction("CONFIRM_AUTH_VALIDITY");
const purgeAuth = createAction("PURGE_AUTH");

function setAuth(clientId, clientSecret, refreshToken) {
  return async (dispatch, getState, apis) => {
    apis.shotStorage.setClientId(clientId);
    apis.shotStorage.setClientSecret(clientSecret);
    apis.shotStorage.setRefreshToken(refreshToken);
    // And keep local storage in sync.
    try {
      if (clientId !== undefined) {
        window.localStorage.setItem('client_id', clientId);
      } else {
        window.localStorage.removeItem('client_id');
      }
      if (clientSecret !== undefined) {
        window.localStorage.setItem('client_secret', clientSecret);
      } else {
        window.localStorage.removeItem('client_secret');
      }
      if (refreshToken !== undefined) {
        window.localStorage.setItem('refresh_token', refreshToken);
      } else {
        window.localStorage.removeItem('refresh_token');
      }
    } catch (e) {
      console.log("Error when writing to localStorage: " + e);
    }
    
    dispatch(checkingAuth());
    // TODO: timeout after 10s
    const authValid = await apis.shotStorage.isAuthValid();
    dispatch(confirmAuthValidity(authValid));
  };
}

// Menu/options.
const toggleOptionsMenu = createAction("TOGGLE_OPTIONS_MENU");

// Redirects.
const findingRedirect = createAction("FINDING_REDIRECT");
const followingRedirect = createAction("FOLLOWING_REDIRECT");

function redirectRelative(provider, shotId, relativeIndex, history) {
  return async (dispatch, getState, apis) => {
    // For relative index we'll do a vanilla descending list and adjust as needed.
    dispatch(findingRedirect());
    
    try {
      // TODO: parent filter set
      let parentFilterSet = [];
      
      let nextShotFileId;
      let allShots = [];
      let shots;
      let continuationToken;
      let currentShotIndex;
      do {
        // Searching phase.
        // TODO: use provider.
        [shots, continuationToken] = await apis.shotStorage.listShots({parentIds: [...parentFilterSet]}, {}, continuationToken);
        currentShotIndex = shots.findIndex(shot => shot.id === shotId);
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
        throw "break out";
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
          [shots] = await apis.shotStorage.listShots({parentIds: [...parentFilterSet]}, {numResults: numResultsRequired}, continuationToken);
          if (shots.length < numResultsRequired) {
            // Index too big. Use last file.
            numResultsRequired = shots.length;
          }
          nextShotFileId = shots[numResultsRequired-1].id;
        }
      }

      history.replace(`/personal/drive/${nextShotFileId}`);
      dispatch(followingRedirect());
    } catch (e) {
      // Default to list
      history.replace('/');
      dispatch(followingRedirect());
    }
  };
}

function redirectAbsolute(provider, absoluteIndex, history) {
  return async (dispatch, getState, apis) => {
    let parentFilterSet = [];
    
    dispatch(findingRedirect());
    let nextShotFileId;
    try {
      if (absoluteIndex < 0) {
        // Index from end means get descending list.
        let numResultsRequired = Math.abs(absoluteIndex); // e.g. -n means we need nth result from descending list.
        // TODO: use provider.
        let [shots] = await apis.shotStorage.listShots({parentIds: [...parentFilterSet]}, {numResults: numResultsRequired});
        let index = (shots.length < numResultsRequired) ? shots.length - 1 : numResultsRequired - 1;
        nextShotFileId = shots[index].id;
      } else {
        // Index from start means get ascending list.
        let numResultsRequired = absoluteIndex + 1; // e.g. (0-indexed) n means we need (1-indexed) n+1th result from ascending list.
        let [shots] = await apis.shotStorage.listShots({parentIds: [...parentFilterSet]}, {order: 'asc', numResults: numResultsRequired});
        let index = (shots.length < numResultsRequired) ? shots.length - 1 : numResultsRequired - 1;
        nextShotFileId = shots[index].id
      }
      history.replace(`/personal/drive/${nextShotFileId}`);
      dispatch(followingRedirect());

    } catch (e) {
      history.replace('/');
      dispatch(followingRedirect());
    }
  };
}

function redirectYesterday(history) {
  return async (dispatch, getState, apis) => {
    let parentFilterSet = [];
    
    dispatch(findingRedirect());
    // Do this more reusably.
    try {
      const H_TO_M = 60;
      const M_TO_S = 60;
      const S_TO_MS = 1000;
      let dateYesterday = new Date(Date.now() - (24 * H_TO_M * M_TO_S * S_TO_MS));
      // e.g. 20190303
      let yesterday = dateYesterday.getFullYear() +
        ("0" + (dateYesterday.getMonth()+1)).slice(-2) +
        ("0" + dateYesterday.getDate()).slice(-2);
      let [shots] = await apis.shotStorage.listShots({parentIds: [...parentFilterSet], latest: yesterday}, {numResults: 1});
      if (shots.length === 0) {
        throw "break";
      }
      history.replace(`/personal/drive/${shots[0].id}`);
      dispatch(followingRedirect());

    } catch (e) {
      history.replace('/');
      dispatch(followingRedirect());
    }
  };
}

// Shot listing.
const requestShotsList = createAction("REQUEST_SHOTS_LIST");
const receiveShotsList = createAction("RECEIVE_SHOTS_LIST");

function fetchShotsList() {
  return async (dispatch, getState, apis) => {
    dispatch(requestShotsList());
    
    try {
      let shots = {};
      let [unindexedList] = await apis.shotStorage.listShots({}, {});
      shots.db = unindexedList.reduce(
        (db, item) => {
          db[item.id] = item;
          return db;
        },
        {}
      );
      shots.list = unindexedList.map(shot => shot.id);
      shots.lastUpdated = Date.now();
      
      dispatch(receiveShotsList(shots));
    } catch (e) {
      dispatch(receiveShotsList(e));
      // Is this needed?
      // throw e;
    }
  };
}

function fetchShotsListIfNeeded() {
  const LIST_SHELF_LIFE = 1 * 60 * 1000; // 60s.
  return async (dispatch, getState, apis) => {
    const state = getState();
    if (!state.shots.fetching && state.shots.lastUpdated < Date.now() - LIST_SHELF_LIFE) {
      dispatch(fetchShotsList());
    }

  };
}

// Shot view.
const requestShot = createAction("REQUEST_SHOT");
const receiveShot = createAction("RECEIVE_SHOT");

function fetchShot(provider, shotId) {
  return async (dispatch, getState, apis) => {
    dispatch(requestShot(shotId));
    try {
      // TODO: get shot from different providers.
      let shot = await apis.shotStorage.getShot(shotId);
      shot.id = shotId;
      shot.lastFetched = Date.now();
      dispatch(receiveShot(shot));
    } catch (e) {
      dispatch(receiveShot(e));
    }
  };
}

function fetchShotIfNeeded(provider, shotId) {
  return (dispatch, getState, apis) => {
    let state = getState();
    if (state.shot.id !== shotId || (state.shot.fetching === false && state.shot.lastFetched === undefined)) {
      dispatch(fetchShot(provider, shotId));
    }
  };
}

function deserializeShot(serializedShot) {
  return (dispatch, getState, apis) => {
    const shot = apis.shotSerializer.deserializeFromUri(serializedShot);
    dispatch(receiveShot(shot));
  };
}

// Sharing.
function goToSharingLinkResult() {
  return (dispatch, getState, apis) => {
    const shotData = getState().shot;
    const shotDataReadyForUri = apis.shotSerializer.serializeForUri(shotData);
    
    // Get url up to hash
    let hashQueryStart = window.location.href.indexOf('#');
    if (hashQueryStart === -1) {
      hashQueryStart = window.location.href.length;
    }
    const uriBase = window.location.href.substring(0, hashQueryStart);

    const sanitizeFilename = (filename) => encodeURIComponent(
      [...filename]
        .map(ch => ch === '.' ? '-' : ch) // Exceptions.
        .join(''));
    const alias = sanitizeFilename(shotData.filename) + '-' + uuidv4();
    const predictedTinyUrl = `https://tinyurl.com/${alias}`;

    const uriBeforeShortening = uriBase + `#/public/binary/${encodeURIComponent(predictedTinyUrl)}/${shotDataReadyForUri}`;

    const requestUrl = `https://tinyurl.com/create.php?alias=${alias}`; // api-create.php does not support parameter 'alias'.
    
    // From https://stackoverflow.com/a/133997
    let form = document.createElement("form");
    form.setAttribute("method", 'POST');
    form.setAttribute("action", requestUrl);
    form.setAttribute('target', '_blank');

    let urlField = document.createElement('input');
    urlField.setAttribute('type', 'hidden');
    urlField.setAttribute('name', 'url');
    urlField.setAttribute('value', uriBeforeShortening);
    form.appendChild(urlField);
    
    document.body.appendChild(form);
    form.submit(); // Adios.
  };
}


// Diagnostics
const refreshDiagnostics = createAction("REFRESH_DIAGNOSTICS");
const runningDiagnostics = createAction("RUNNING_DIAGNOSTICS");
const finishedDiagnostics = createAction("FINISHED_DIAGNOSTICS");
const reportDiagnosticDriveRootGettable = createAction("REPORT_DIAGNOSTIC_DRIVE_ROOT_GETTABLE");
const reportDiagnosticDriveAllFilesCount = createAction("REPORT_DIAGNOSTIC_DRIVE_ALL_FILES_COUNT");
const reportDiagnosticDriveAllShotsCount = createAction("REPORT_DIAGNOSTIC_DRIVE_ALL_SHOTS_COUNT");
const reportDiagnosticDriveAllValidShotsCount = createAction("REPORT_DIAGNOSTIC_DRIVE_ALL_VALID_SHOTS_COUNT");
const reportDiagnosticDriveAllInvalidShotsCount = createAction("REPORT_DIAGNOSTIC_DRIVE_ALL_INVALID_SHOTS_COUNT");


function launchDiagnostics() {
  return async (dispatch, getState, apis) => {
    dispatch(runningDiagnostics());
    
    const authValid = await apis.shotStorage.isAuthValid();
    if (authValid === false) {
      dispatch(finishedDiagnostics());
      return;
    }
    let gapiWrapper = apis.shotStorage.getGapiWrapperForDiagnostics()
    // Drive get root.
    const root = await gapiWrapper.getFile('root');
    const rootGotten = root.id !== undefined || root.name !== undefined;
    dispatch(reportDiagnosticDriveRootGettable(rootGotten));
    // Drive total file count.
    const keepGettingFiles = async (pageToken) => {
      const [files, nextPageToken]= await gapiWrapper.listFiles('', 'name desc', 1000, pageToken);
      if (nextPageToken === undefined) {
        return files;
      } else {
        return files.concat(await keepGettingFiles(nextPageToken));
      }
    };
    const allFiles = await keepGettingFiles();
    dispatch(reportDiagnosticDriveAllFilesCount(allFiles.length));
    // Drive total files with .shot extension.
    const allShotFiles = allFiles.filter(file => file.name.endsWith('.shot'));
    dispatch(reportDiagnosticDriveAllShotsCount(allShotFiles.length));
    // Drive total valid shot file count.
    const [allValidShotFiles] = await apis.shotStorage.listShots({}, {numResults: allFiles.length});
    dispatch(reportDiagnosticDriveAllValidShotsCount(allValidShotFiles.length));
    // Drive invalid named shot file count.
    const invalidShotFileNameCount = allShotFiles.length - allValidShotFiles.length;
    dispatch(reportDiagnosticDriveAllInvalidShotsCount(invalidShotFileNameCount));
    
    dispatch(finishedDiagnostics());
  };
}

