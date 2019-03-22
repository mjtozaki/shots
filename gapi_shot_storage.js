

class GapiShotStorage {
  /**
   * Creates a shot store based on Google Drive/Sheets.
   *
   * Args:
   *   gapiWrapper: provides abstraction to uncolored Google APIs.
   *   shotCodec: parses shot files. TODO: replace with a factory? No way to distinguish versions of shots however.
   *   apiKey: api key. Immutable.
   *   clientId: client ID. Immutable.
   */
  constructor(gapiWrapper, shotCodec) {
    this._gapiWrapper = gapiWrapper;
    this._shotCodec = shotCodec;
    // this._apiKey = apiKey;
    // this._clientId = clientId;
    this._continuations = new Map();
  }
  
  setApiKey(apiKey) {
    this._apiKey = apiKey;
  }
  
  setClientId(clientId) {
    this._clientId = clientId;
  }
  // getApiKey() {
    // return this._apiKey;
  // }
  
  // getClientId() {
    // return this._clientId;
  // }
  
  // TODO: break auth out into its own class. So we can manage apiKey+clientId vs clientId+clientSecret+refreshToken.
  isAuthCompatible(apiKey, clientId) {
    return apiKey === this._apiKey && clientId === this._clientId;
  }
  
  _takeContinuation(continuationToken) {
    if (!this._continuations.has(continuationToken)) {
      return null;
    }
    var continuation = this._continuations.get(continuationToken);
    this._continuations.delete(continuationToken);
    return continuation;
  }
      
  
  _giveContinuation(continuationToken, continuation) {
    this._continuations.set(continuationToken, continuation);
  }

  
  
  
  async _listShotsWithGapi(q, orderBy, numResults, filterParams, nextPageToken) {
    var [files, nextPageToken] = await this._gapiWrapper.listFiles(q, orderBy, numResults, nextPageToken);
    // Client-side filters: date-based.
    var filteredFiles = files
      .filter(file => {
        // Must have the shot extension.
        if (!file.name.endsWith('.shot')) {
          return false;
        }
        // Cannot be older than specified.
        if (filterParams.latest !== undefined
          && filterParams.latest < file.name.substring(0, filterParams.latest.length)) {
          return false;
        }
        // Cannot be younger than specified.
        if (filterParams.earliest !== undefined
          && filterParams.earliest > file.name.substring(0, filterParams.earliest.length)) {
          return false;
        }
        return true;
      })
      .map(file => {
        // Exact file datetime.
        var datetime;
        var result = GapiShotStorage.SHOTFILE_DATETIME_PATTERN.exec(file.name);
        if (result === null) {
          console.log(`Failed to find datetime of shot file ${file.name} (${file.fileId}).`);
        } else {
          datetime = new Date(result[1], result[2]-1, result[3], result[4], result[5], result[6]);
        }
        return {
          name: file.name,
          id: file.id,
          date: datetime,
          parent: file.parent,
        };
      });
    return [filteredFiles, nextPageToken];
  }
  
  
  
  /**
   * List shots ordered by time (read: files that end in ".shot", ordered by filename).
   *
   * Args:
   *   filterParams: object,
   *     parentIds: only files with a parentId from this are listed. Default is all parents.
   *     latest: date upper bound inclusive. Undefined means no bounds.
   *     earliest: date lower bound inclusive. Undefined means no bounds.
   *       Note that date bounds can contain all elements within the date-formatted shot filename.
   *       Time is implicitly in shot locale, which can be different for each shot file.
   *       e.g. any string prefix of yyyyMMddThhmmss e.g. 20190311T131211
   *   viewParams: object,
   *     order: {'asc','desc'}. Default is 'desc'. Determines not only returned result but also RPC parameters.
   *     numResults: max number of results to return per invocation. Default is 1000.
   *   continuationToken: opaque string used to continue a previous search.
   *     filterParams and viewParams must be the same as the previous search to work.
   * Date bounds allows continuing a search without a continuation token, at the cost of more RPCs.
   * Sensible when continuation tokens have no SLA and aren't persistent between browser load/unload periods.
   *
   * Returns a promise for an object:
   *   continuationToken: "opaque" continuation token for next round of list. if no more, undefined.
   *     May contain characters that need to be escape as part of a URI.
   *   result: the list of objects
   *     name: shot file name.
   *     id: shot id.
   *     date: Date instance when shot occurred.
   *     parents: list of objects
   *       name: parent name.
   *       parentId: parent id.
   */
  async listShots(filterParams, viewParams, continuationToken) {
    // Server-side filtering: coarse for files containing "shot" and for particular parents.
    var q = "name contains 'shot'";
    if (filterParams.parentIds !== undefined && filterParams.parentIds.length > 0) {
      q += ' and ('
      var delimiter = "";
      filterParams.parentIds.forEach(parentId => {
        q += delimiter + `'${parentId} in parents'`;
        delimiter = " or ";
      });
      q += ')';
    }
    
    // Always order by name. Assumption: shot filenames are just the ISO date time. More reliable time ordering than file properties.
    var ascending = (viewParams.order !== undefined && viewParams.order === 'asc'); // Default to desc.
    var orderBy = ascending ? "name" : "name desc";

    // numResults influences the API usage IFF we don't expect the desired payload to be at the front of the results.
    // This is to prevent too many RPCs.
    var frontloaded = ( (ascending && filterParams.earliest === undefined) || (!ascending && filterParams.latest === undefined) );
    var numResults = GapiShotStorage.LIST_MAX_RESULTS; // Num results to return.
    var pageSize = numResults; // Num results to request in RPC.
    if (viewParams.numResults !== undefined) {
      numResults = viewParams.numResults;
      if (frontloaded) {
        // Only use non-default in RPC if data is frontloaded.
        // Actually, don't even do it then. This scheme doesn't work because _GapiWrapper.listFiles may return files that aren't .shot.
        //pageSize = numResults; // Sanitized by gapiWrapper.
      }
    }

    // Continuation token processing.
    var buffer = [];
    var nextPageToken;
    var nextPageFilters;
    if (continuationToken !== undefined) {
      var continuation = this._takeContinuation(continuationToken);
      if (continuation === null) {
        // Browser session changed, or continuation already taken. Simulate with filterParams.
        var [unusedUuid, continuationAsFilters] = GapiShotStorage._processContinuationToken(continuationToken);
        filterParams = {...filterParams}; // Don't modify the original. Only non-primitive is parents.
        GapiShotStorage._updateFilterParamsWithContinuation(filterParams, continuationAsFilters);
        
      } else {
        // Use continuation for initial buffer.
        buffer = continuation.buffer;
        nextPageToken = continuation.nextPageToken;
        nextPageFilters = continuation.nextPageFilters;
      }
    }
    
    // Fill buffer.
    var files;
    var firstIteration = true;
    await this._gapiWrapper.ensureApiKeyAndClientIdAuthed(this._apiKey, this._clientId);
    while (true) {
      if (buffer.length >= numResults) {
        var results = buffer.slice(0, numResults);
        var leftover = buffer.slice(numResults);
        
        let nextContinuationToken;
        if (leftover.length >= 0 || nextPageToken !== undefined) {
          // Create continuation for remaining results.
          
          // How to continue without the nextPageToken.
          var nextContinuationAsFilters = GapiShotStorage._makeContinuationAsFiltersString(buffer[buffer.length-1].date, ascending);
          nextContinuationAsFilters = nextContinuationAsFilters.split('=');

          var dateBound = GapiShotStorage._makeContinuationAsFiltersString(results[numResults-1].date, ascending);
          nextContinuationToken = `${dateBound}&${uuidv4()}`; // e.g. earliest=20190101T120000&xxxxxxxxxxxxxxx-xxxxx
          var nextContinuation = {
            buffer: leftover,
            nextPageFilters: nextContinuationAsFilters, // How to continue after the continuation, with filters.
            nextPageToken: nextPageToken, // How to continue after the continuation, with a Gapi nextPageToken.
          };
          this._giveContinuation(nextContinuationToken, nextContinuation);
        }
        return [results, nextContinuationToken];
      } else if (!firstIteration && nextPageToken === undefined) {
        // No more results. Done.
        return [buffer];
      }
      
      try {
        [files, nextPageToken] = await this._listShotsWithGapi(q, orderBy, pageSize, filterParams, nextPageToken);
      } catch (e) {
        if (e instanceof GapiPageTokenError && firstIteration && nextPageFilters !== undefined) {
          // nextPageFilters (using filters to simulate nextPageToken if it expired) only supported for first iteration.
          filterParams = {...filterParams}; // Don't modify the original. Only non-primitive is parents.
          GapiShotStorage._updateFilterParamsWithContinuation(filterParams, nextPageFilters);
          nextPageFilters = undefined;
          continue;
          // [files, nextPageToken] = await this._listShotsWithGapi(q, orderBy, pageSize, filterParams, nextPageToken);
        } else {
          // Surface all other errors.
          throw e;
        }
      }
      buffer.push(...files);
      firstIteration = false;
    }
  }
  
  static _processContinuationToken(continuationToken) {
    var nextPageToken;
    var continuationAsFilters;
    if (continuationToken !== undefined) {
      var parts = continuationToken.split('&');
      continuationAsFilters = parts[0].split('='); // Only one term for now.
      nextPageToken  = parts[1];
    }
    return [nextPageToken, continuationAsFilters];
  }
  
  static _updateFilterParamsWithContinuation(filterParams, continuationAsFilters) {
    if (continuationAsFilters[0] === 'earliest') {
      filterParams.earliest = continuationAsFilters[1];
    } else if (continuationAsFilters[0] === 'latest') {
      filterParams.latest = continuationAsFilters[1];
    } else {
      throw 'Bad continuation token.';
    }
  }
  
  /**
   * Get shot data.
   *
   * Args:
   *   shotId: shot's id.
   *
   * Returns a promise for a shot object
   *   timestamp: Date representing time shot made.
   *   elapsed: array of times since start for data points.
   *   pressure: array of pressure for data points.
   *   weight: array of weight for data points.
   *   flow: array of flow for data points.
   *   flowWeight: array of flow weight(?) for data points.
   *   temperatureBasket: array of basket temperature for data points.
   *   temperatureMix: array of mixed water temperature for data points.
   *   temperatureTarget: array of target basket temperature for data points.
   *   author: author name.
   */
  async getShot(shotId) {
    await this._gapiWrapper.ensureApiKeyAndClientIdAuthed(this._apiKey, this._clientId);
    let shotFile = await this._gapiWrapper.getFile(shotId);
    let shotFileContents = await this._gapiWrapper.getFileContents(shotId);
    return this._shotCodec.getShotFromFileContents(shotFileContents, shotFile);
  }
  
  /**
   * Update metadata for a shot.
   *
   * Args:
   *   shotId: shot to update metadata for.
   *   metadata: object
   *     TODO: metadata stuff
   *
   * Returns a promise that resolves to the updated metadata.
   */
  updateShotMetadata(shotId, metadata) {
	  
  }
  
  /**
   * Get metadata for a shot.
   *
   * Args:
   *   shotId: shot to get metadata for.
   *
   * Returns a promise for an object
   *   TODO
   */
  getShotMetadata(shotId) {
    
  }
  
  /** 
   * Get a list of coffee lots.
   *
   * Returns a promise for a list of objects
   *   id: coffee lot id.
   *   TODO:
   */
  getCoffeeLots() {
	  
  }
  
  /** 
   * Add a coffee lot.
   *
   * Args:
   *   coffeeLot: an object 
   *     TODO
   *
   * Returns a promise for the coffee lot that was added, an object
   *   id: coffee lot id.
   *   TODO:
   */
  addCoffeeLot(coffeeLot) {
    
  }
  
  /** 
   * Updates a coffee lot.
   *
   * Args:
   *   coffeeLotId: coffee lot to update.
   *   coffeeLot: an object
   *     TODO
   *
   * Returns a promise for the updated coffee lot.
   */
  updateCoffeeLot(coffeeLotId, coffeeLot) {
    
  }

  /** 
   * Get a list of coffee sources.
   *
   * Returns a promise for a list of objects
   *   id: coffee source id.
   *   TODO:
   */
  getCoffeeSources() {
	
  }
  
  /** 
   * Adds a coffee source.
   *
   * Returns a promise for the added coffee source.
   */
  addCoffeeSource(coffeeSource) {
    
  }
  
  /** 
   * Updates a coffee source.
   *
   *
   * Args:
   *   coffeeSourceId: coffee source to update.
   *   coffeeSource: updated details.
   *
   * Returns a promise for the updated coffee source.
   */
  updateCoffeeSource(coffeeSourceId, coffeeSource) {
    
  }
  
  /**
   * Lists metadata tables available.
   *
   * Returns a promise for a list of objects
   *   name: shot metadata table name.
   *   tableId: shot metadata table id.
   *   parents: list of objects
   *     name: parent name.
   *     parentId: parent id.
   */
  //listShotMetadataTables() {
    
  //}
  
  /**
   * Gets a shot metadata table.
   *
   * Args:
   *   tableId: shot metadata table id.
   *
   * Returns a ShotMetadataTable instance.
   */
  //getShotMetadataTable(tableId) {
    
  //}
}

// Static constants
GapiShotStorage.LIST_MAX_RESULTS = 1000;

// Parse the date out of shot file filenames.
// Example filename: "20190202T141820.shot".
GapiShotStorage.SHOTFILE_DATETIME_PATTERN = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/i;

GapiShotStorage._dateToShotFilename = function(m) {
  // From https://stackoverflow.com/a/8363049
  return m.getFullYear() +
    ("0" + (m.getMonth()+1)).slice(-2) +
    ("0" + m.getDate()).slice(-2) +
    'T' +
    ("0" + m.getHours()).slice(-2) +
    ("0" + m.getMinutes()).slice(-2) +
    ("0" + m.getSeconds()).slice(-2);
}

/** Returns the next oldest shot filename that could exist. */
GapiShotStorage._nextOldestFilename = function(date) {
  // This obviously only works if the filename has not been touched. 
  return GapiShotStorage._dateToShotFilename(
    new Date(date.valueOf() + 1000)); // 1000ms later guarantees a different file.
}

/** Returns the next youngest shot filename that could exist. */
GapiShotStorage._nextYoungestFilename = function(date) {
  return GapiShotStorage._dateToShotFilename(
    new Date(date.valueOf() - 1000));
}

GapiShotStorage._makeContinuationAsFiltersString = function(lastDate, ascending) {
  var dateBound;
  if (ascending) {
    var dateString = GapiShotStorage._nextOldestFilename(lastDate);
    dateBound = `earliest=${dateString}`
  } else { // Descending.
    var dateString = GapiShotStorage._nextYoungestFilename(lastDate);
    dateBound = `latest=${dateString}`
  }
  return dateBound;
}

// GapiShotStorage._makeContinuationAsFilters = function(lastDate, ascending) {
  // var continuationAsFilters;
  // if (ascending) {
    // var dateString = GapiShotStorage._nextOldestFilename(lastDate);
    // continuationAsFilters = {earliest: dateString};
  // } else { // Descending.
    // var dateString = GapiShotStorage._nextYoungestFilename(lastDate);
    // continuationAsFilters = {latest: dateString};
  // }
  // return continuationAsFilters;
// }





/**
 * Stores an ordered list of entries per key.
 * Entries may disappear at any time.
 */
class _ListCache {
  constructor(cacheSize) {
    this._cacheSize = cacheSize;
  }
  
  enqueue(key, value) {
    
  }
  
  dequeue(key, count) {
    
  }
}









// TODO: delete. this is not useful given async/await.
class _BufferStage {
  constructor(targetNumItems) {
    this._targetNumItemds = targetNumItems;
  }
  
  /**
   * Set initial function which returns promise for first set of results.
   */
  setInitialFunction(initialFunction) {
    this._initialFunction = initialFunction;
  }
  
  /**
   * Set next function which returns promise for subsequent sets of results with args:
   *   continuationToken: the continuation token for the next set of results.
   */
  setNextFunction(nextFunction) {
    this._nextFunction = nextFunction;
  }
  
  /**
   * Set map result function which takes the output from either the initial or next
   * functions and return promise for array:
   *   [0]: array of items.
   *   [1]: continuation token. null if it doesn't exist.
   */
  setMapResultFunction(mapResultFunction) {
    this._mapResultFunction = mapResultFunction;
  }
  
  /**
   * Returns a promise for object
   *   buffer: array of items.
   *   leftover: array containing overflow.
   *   continuationToken: last continuation token returned.
   */
  fillBuffer() {
    var bufferSoFar = [];
    return _recursivelyMapResultAndDoNextFunction(
      bufferSoFar,
      this._initialFunction());
  }
  
  _recursivelyMapResultAndDoNextFunction(bufferSoFar, previousPromise) {
    return previousPromise
      .then(this._mapResultFunction)
      .then(([items, continuationToken]) => {
        bufferSoFar.push(...items);
        // TODO: divvy it up correctly from the beginning.
        if (bufferSoFar.length >= this.targetNumItems) {
          var result = {
            buffer: bufferSoFar.slice(0, this.targetNumItems),
            leftover: bufferSoFar.slice(this.targetNumItems),
            continuationToken: continuationToken,
          };
          return result;
        }
        return recursivelyMapResultAndDoNextFunction(
          this._nextFunction(continuationToken));
      });
  }
}