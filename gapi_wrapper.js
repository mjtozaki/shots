"use strict";

class TimedCache {
  // TODO: cache groups with their own cache durations and element limits.
  // e.g. parents name lookup cache should be forever (unlikely a folder will be renamed)
  // e.g. shot file contents should be limited to something like 10 elements. And cache duration should be forever.
  constructor(cacheDuration) {
    this.cacheDuration = cacheDuration;
    this.table = new Map();
  }

  _has(key) {
    if (this.table.has(key)) {
      var wrapped = this.table.get(key);
      if (Date.now() < wrapped.time + this.cacheDuration) {
        return true;
      }
      this.table.delete(key);
    }
    return false;
  }
  get(key) {
    if (this._has(key)) {
      return this.table.get(key).value;
    }
    return null;
  }
  set(key, value) {
    this.table.set(key, TimedCache.wrapWithTime(value));
  }
  static wrapWithTime(value) {
    return {time: Date.now(), value: value};
  }
}

// Parse the date out of shot file filenames.
// Assume file will CONTAIN this pattern, not exactly match.
// A user may edit filename, but is expected to leave datetime intact.
// Example filename: "20190202T141820.shot" or "freds_20190202T141820.shot"
const SHOTFILE_DATETIME_PATTERN = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/i;

class DirectoryMetadata {
   constructor(fileId, name) {
     this.fileId = fileId;
     this.name = name;
   }
}

class ShotFileMetadata {
  constructor(fileId, name, parents, datetime) {
    this.fileId = fileId;
    this.name = name;
    this.parents = parents; // DirectoryMetadata[]
    this.datetime = datetime;
    this.friendlyName = null; // TODO: remove. layer breaking.
  }
}

class ShotIndexFileMetadata {
  constructor(fileId, name, parents, modifiedTime) {
    this.fileId = fileId;
    this.name = name;
    this.parents = parents; // DirectoryMetadata[]
    this.modifiedTime = modifiedTime;
  }
}

// TODO: locking
class _GapiWrapper {
  constructor() {
    this.activeApiKey = null;
    this.activeClientId = null;
    this.acquiringApiKey = null;
    this.acquiringClientId = null;
    this.whenApiKeyAndClientIdAuthed = null;
    this.whenClientAndAuthLoaded = null;
    const CACHE_DURATION = 1 * 60 * 1000; // Minutes.
    this.rpcCache = new TimedCache(CACHE_DURATION);
    
    // Cache that never expires. Different from rpc cache because it is derived from an RPC, and it is mutable.
    this.annotationsCache = new Map();
  }
  
  ensureClientAndAuthLoaded() {
    if (this.whenClientAndAuthLoaded !== null) {
      return this.whenClientAndAuthLoaded;
    }
    
    this.whenClientAndAuthLoaded = new Promise(
      resolve => gapi.load('client:auth2', resolve));
    return this.whenClientAndAuthLoaded;
  }
  
  
  ensureApiKeyAndClientIdAuthed(apiKey, clientId) {
    // TODO: refactor
    var SCOPE = 'https://www.googleapis.com/auth/drive';

    // TODO: also check that another api/client hasn't begun auth.
    if (this.activeApiKey === apiKey && this.activeClientId === clientId) {
      return Promise.resolve(true);
    }
    
    if (this.acquiringApiKey === apiKey && this.acquiringClientId === clientId && this.whenApiKeyAndClientIdAuthed !== null) {
      return this.whenApiKeyAndClientIdAuthed;
    }
    
    this.acquiringApiKey = apiKey;
    this.acquiringClientId = clientId;
    this.whenApiKeyAndClientIdAuthed =
      this.ensureClientAndAuthLoaded()
      .then(
        // Init client.
        function() {
          return gapi.client.init({
            'apiKey': apiKey,
            'clientId': clientId,
            'scope': SCOPE,
          });
        },
        function() {
          // Throw.
        }
      )
      .then(
        // Ensure signed in.
        function() {
          var needToSignIn = true;
          var GoogleAuth = gapi.auth2.getAuthInstance();
          if (GoogleAuth.isSignedIn.get()) {
            var user = GoogleAuth.currentUser.get();
            var isAuthorized = user.hasGrantedScopes(SCOPE);
            if (!isAuthorized) {
              console.log("Signed in and not authorized.");
            } else {
              needToSignIn = false;
              console.log("Signed in and authorized!");
            }
          } else {
            console.log("Not signed in.");
          }
          if (needToSignIn) {
            return GoogleAuth.signIn();
          }
          return Promise.resolve(true);
        },
        function() {
          // Throw.
        }
      )
      .then(
        // Record that we are signed in.
        () => {
          // TODO: check that acquiring is same as local key and client id. If not, then do not record?
          this.activeApiKey = apiKey;
          this.activeClientId = clientId;
        },
        function() {
          // Throw
          console.log('signIn() failed apparently.');
        }
      );
    return this.whenApiKeyAndClientIdAuthed;
  }
  
  _makeListShotFilesCacheKey(parentFilterSet) {
    var key = `${this.activeApiKey},${this.activeClientId},listShotFiles,[`;
    key += [...parentFilterSet].sort().join(',');
    key += ']';
    return key;
  }
  
  static deepCopyFileList(fileList) {
    // As deep as we're going.
    return [...fileList];
  }
  
  /** Use once authenticated and authorized. */
  listShotFiles(parentFilterSet = new Set()) {
    var cacheKey = this._makeListShotFilesCacheKey(parentFilterSet);
    var cacheValue = this.rpcCache.get(cacheKey);
    if (cacheValue !== null) {
      return cacheValue
        .then(_GapiWrapper.deepCopyFileList);
    }
    
    console.log('Requesting files.list');
    var q = "name contains '.shot'";
    if (parentFilterSet.size > 0) {
      q += " and (";
      var delimiter = '';
      parentFilterSet.forEach(
        parent => {
          // Overcollects to all files where any ancestor matches the filter.
          q += delimiter + `${parent} in parents`;
          delimiter = ' or ';
        });
      q += ")";
    }
    var rpcPromise = gapi.client.request({
      'path': 'https://www.googleapis.com/drive/v3/files',
      'params': {
        'spaces': 'drive' /*,appDataFolder*/,
        'q': q,
        'fields': 'nextPageToken,files(id,name,parents)',
      },
    })
    .then(
      // Lookup parent names.
      response => {
        // File listing
        console.log(response);

        var shotFiles = response.result.files.filter(
          file => {
            if (!file.name.endsWith('.shot')) {
              return false;
            }
            return parentFilterSet.size == 0 ||
              file.parents.length == 0 ||
              parentFilterSet.has(file.parents[file.parents.length - 1]);
          });
        console.log(shotFiles);
        
        var parents = new Set(
          shotFiles
            .flatMap(shotFile => shotFile.parents));
        return Promise.all([shotFiles, this.getNamesForFileIds(parents)]);
      })
    .then(
      ([shotFiles, parentIdsToNames]) => {
        return shotFiles
          .map(
            shotFile => {
              // Exact file datetime.
              var datetime = null;
              var result = SHOTFILE_DATETIME_PATTERN.exec(shotFile.name);
              if (result === null) {
                console.log(`Failed to find datetime of shot file ${shotFile.name} (${shotFile.fileId}).`);
              } else {
                datetime = new Date(result[1], result[2]-1, result[3], result[4], result[5], result[6]);
              }

              // Create arrays of parents for files
              var parents = shotFile.parents.map(
                parentId => parentIdsToNames.get(parentId));
              return new ShotFileMetadata(shotFile.id, shotFile.name, parents, datetime);
            })
          .sort(
            (first, second) => first.datetime.getTime() - second.datetime.getTime());
      });

    this.rpcCache.set(cacheKey, rpcPromise);
    return rpcPromise
      .then(_GapiWrapper.deepCopyFileList);
  }
  
  
  _makeNameForFileIdCacheKey(fileId) {
    var key = `${this.activeApiKey},${this.activeClientId},nameForFileId,${fileId}`;
    return key;
  }

  getNamesForFileIds(fileIds) {
    // Caches per fileId, not the batch as a whole.
    var results = new Map();
    
    var lookupIds = [];
    fileIds.forEach(fileId => {
      var cacheKey = this._makeNameForFileIdCacheKey(fileId);
      var cacheValue = this.rpcCache.get(cacheKey);
      if (cacheValue !== null) {
        results.set(fileId, cacheValue);
      } else {
        lookupIds.push(fileId);
      }
    });

    // No lookups required.
    if (lookupIds.length === 0) {
      return Promise.resolve(results);
    }

    var batch = gapi.client.newBatch();
    lookupIds.forEach(
      fileId => {
        batch.add(
          gapi.client.request({
            'path': `https://www.googleapis.com/drive/v3/files/${fileId}`,
            'params': {
              'fields': 'name',
            },
          }),
          {
            id: fileId,
          });
      });
    return batch
      .then(
        response => {
          var idToResourceMapping = response.result;
          
          Object.keys(idToResourceMapping)
            .forEach(fileId => {
              var name = idToResourceMapping[fileId].result.name;
              var cacheKey = this._makeNameForFileIdCacheKey(fileId);
              this.rpcCache.set(cacheKey, name);
              results.set(fileId, name);
            });
          
          return results;
        });
  }
  
  _makeListShotIndexFilesCacheKey() {
    var key = `${this.activeApiKey},${this.activeClientId},listShotIndexFiles`;
    return key;
  }
  
  /** Use once authenticated and authorized. */
  listShotIndexFiles() {
    var cacheKey = this._makeListShotIndexFilesCacheKey();
    var cacheValue = this.rpcCache.get(cacheKey);
    if (cacheValue !== null) {
      return cacheValue
        .then(_GapiWrapper.deepCopyFileList);
    }
    
    console.log('Requesting files.list');
    var q = "name contains '.shotindex'";
    var rpcPromise = gapi.client.request({
      'path': 'https://www.googleapis.com/drive/v3/files',
      'params': {
        'spaces': 'drive',
        'q': q,
        'fields': 'nextPageToken,files(id,name,parents,modifiedTime)',
      },
    })
    .then(
      // Lookup parent names.
      response => {
        // File listing
        console.log(response);

        var shotIndexFiles = response.result.files.filter(
          file => {
            return file.name.endsWith('.shotindex');
          });
        console.log(shotIndexFiles);
        
        var parents = new Set(
          shotIndexFiles
            .flatMap(shotIndexFile => shotIndexFile.parents));
        return Promise.all([shotIndexFiles, this.getNamesForFileIds(parents)]);
      })
    .then(
      ([shotIndexFiles, parentIdsToNames]) => {
        return shotIndexFiles
          .map(
            shotIndexFile => {
              var parents = shotIndexFile.parents.map(
                parentId => parentIdsToNames.get(parentId));
              return new ShotIndexFileMetadata(shotIndexFile.id, shotIndexFile.name, parents, shotIndexFile.modifiedTime);
            })
          .sort(
            (first, second) => first.modifiedTime.localeCompare(second.modifiedTime));
      });

    this.rpcCache.set(cacheKey, rpcPromise);
    return rpcPromise
      .then(_GapiWrapper.deepCopyFileList);
  }
  
  _makeGetFileContentsCacheKey(fileId) {
    return `${this.activeApiKey},${this.activeClientId},getFileContents,${fileId}`;
  }
  
  // TODO: return a copy
  /**
   * Returns file contents.
   * Use once authenticated and authorized.
   */
  getFileContents(fileId) {
    // TODO: implement cache size constraints to avoid cache getting too big.
    var cacheKey = this._makeGetFileContentsCacheKey(fileId);
    var cacheValue = this.rpcCache.get(cacheKey);
    if (cacheValue !== null) {
      return cacheValue;
    }
    
    var rpcPromise = gapi.client.request({
      'path': 'https://www.googleapis.com/drive/v3/files/' + fileId,
      'params': {
         'alt': 'media',
      },
    })
    .then(
      function(response) {
        console.log(response);
        return response.body;
      }
    );
    this.rpcCache.set(cacheKey, rpcPromise);
    return rpcPromise;
  }
  
  getFileIndexMetadata(shotFileId, shotIndexFileId) {
    // TODO: finer grain retrieval.
    return this.getAllShotAnnotations(shotIndexFileId)
      .then(
        shotFileIdToAnnotations => {
          if (shotFileIdToAnnotations.has(shotFileId)) {
            return shotFileIdToAnnotations.get(shotFileId);
          }
          return {};
        });
  }
  
  static currentShotsSchemaVersionNumber() { return 'v1'; }
  static currentShotsHeader() {
    return ['File ID', 'Last Updated', 'Dose Mass', 'Beverage Mass', 'Grind', 'Description', 'Coffee Source ID']
  }
  static arraysAreEqualValues(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; ++i) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  
  // TODO: move this to another file. shot file understanding doesn't belong in gapi wrapper necessarily.
  getAllShotAnnotations(annotationsFileId) {
    // TODO: Shots schema v2 should have:
    //  -data checksum
    
    if (this.annotationsCache.has(annotationsFileId)) {
      return Promise.resolve(this.annotationsCache.get(annotationsFileId));
    }
    
    // All cells of Shots.
    var range = `Shots`;
    
    var rpcPromise = gapi.client.request({
      'path': `https://sheets.googleapis.com/v4/spreadsheets/${annotationsFileId}/values/${range}?` +
          `majorDimension=ROWS`,
    })
      .then(
        response => {
          var matrix = response.result.values;
          var schema = matrix[0];
          var header = matrix[1];
          
          if (schema[0] !== _GapiWrapper.currentShotsSchemaVersionNumber()) {
            throw 'Only support annotations file up to ' + _GapiWrapper.currentShotsSchemaVersionNumber();
          }
          
          // Header must equal fixed set.
          if (!_GapiWrapper.arraysAreEqualValues(header, _GapiWrapper.currentShotsHeader())) {
            throw 'Annotations file has a bad header. Expected ' + _GapiWrapper.currentShotsHeader();
          }
          
          var shotIdToAnnotations = new Map();

          for (let i = 2; i < matrix.length; ++i) {
            var row = matrix[i];
            var fileId = row.shift();
            var lastUpdated = row.shift();
            var doseMass = row.shift();
            var beverageMass = row.shift();
            var grind = row.shift();
            var description = row.shift();
            var coffeeSourceId = row.shift();
            
            if (fileId === undefined) {
              return;
            }
            shotIdToAnnotations.set(fileId, {
              lastUpdated: lastUpdated,
              doseMass: doseMass,
              beverageMass: beverageMass,
              grind: grind,
              description: description,
              coffeeSourceId: coffeeSourceId,
              rowNumber: i+1,
            });
          }
          
          this.annotationsCache.set(annotationsFileId, shotIdToAnnotations);
          return shotIdToAnnotations;
        });
    return rpcPromise;
  }
  
  // TODO: coffee source id
  updateShotAnnotations(fileId, annotationsFileId, annotations) {
    if (annotations.rowNumber === '') {
      // Append.
      var values = [[fileId, annotations.lastUpdated, annotations.doseMass, annotations.beverageMass, annotations.grind, annotations.description]];
      return GapiWrapper.appendSheetValues(annotationsFileId, 'Shots', values)
        .then(updates => {
          if (this.annotationsCache.has(annotationsFileId)) {
            var fileIdToAnnotations = this.annotationsCache.get(annotationsFileId);
            if (!fileIdToAnnotations.has(fileId)) {
              fileIdToAnnotations.set(fileId, {});
            }
            var existingAnnotations = fileIdToAnnotations.get(fileId);
            existingAnnotations.lastUpdated = annotations.lastUpdated;
            existingAnnotations.doseMass = annotations.doseMass;
            existingAnnotations.beverageMass = annotations.beverageMass;
            existingAnnotations.grind = annotations.grind;
            existingAnnotations.description = annotations.description;
            
            // Example: Shots!A9:F9
            var matches = /:[a-zA-Z]+([0-9]+)$/.exec(updates.updatedRange);
            existingAnnotations.rowNumber = (matches !== null) ? matches[1] : "";
          }
          return updates;
        });
      // TODO: then update cache.
    } else {
      // Set.
      var range = `Shots!B${annotations.rowNumber}:F${annotations.rowNumber}`;
      var values = [[/*no fileId*/ annotations.lastUpdated, annotations.doseMass, annotations.beverageMass, annotations.grind, annotations.description]];
      return GapiWrapper.setSheetValues(annotationsFileId, range, values)
        .then(result => {
          if (this.annotationsCache.has(annotationsFileId)) {
            var fileIdToAnnotations = this.annotationsCache.get(annotationsFileId);
            if (!fileIdToAnnotations.has(fileId)) {
              fileIdToAnnotations.set(fileId, {});
            }
            var existingAnnotations = fileIdToAnnotations.get(fileId);
            existingAnnotations.lastUpdated = annotations.lastUpdated;
            existingAnnotations.doseMass = annotations.doseMass;
            existingAnnotations.beverageMass = annotations.beverageMass;
            existingAnnotations.grind = annotations.grind;
            existingAnnotations.description = annotations.description;
            existingAnnotations.rowNumber = annotations.rowNumber;
          }
          return result;
        });
      // TODO: then update cache.
    }
  }
  
  /** 
   * range should be the sheet name and cells to set.
   * values should be a two-dimensional area representing rows of columns of cells.
   */
  setSheetValues(spreadsheetId, range, values) {
    return gapi.client.request({
      'path': `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      'params': {
        'valueInputOption': 'RAW',
      },
      'method': 'PUT',
      'body': {
        'range': range,
        'values': values,
      },
    })
    .then(
      function(response) {
        console.log(response);
        var result = response.result;
        if (result.updatedRange !== undefined && result.updatedRange !== '') {
          return result;
        } else {
          throw `Failed to set to spreadsheetId ${spreadsheetId} range ${range} with values ${values}.`;
        }
      }
    );
  }
  
  /** 
   * range should be the sheet name.
   * values should be a two-dimensional area representing rows of columns of cells.
   */
  appendSheetValues(spreadsheetId, range, values) {
    return gapi.client.request({
      'path': `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append`,
      'params': {
        'valueInputOption': 'RAW',
        'insertDataOption': 'INSERT_ROWS',
      },
      'method': 'POST',
      'body': {
        'values': values,
      },
    })
    .then(
      function(response) {
        console.log(response);
        var result = response.result;
        if (result.updates !== undefined && result.updates.updatedRange !== '') {
          return result.updates;
        } else {
          throw `Failed to append to spreadsheetId ${spreadsheetId} range ${range} with values ${values}.`;
        }
      }
    );
  }
}

window.GapiWrapper = new _GapiWrapper();
