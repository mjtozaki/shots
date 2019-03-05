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
    var SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
//       SCOPE += ' https://www.googleapis.com/auth/drive.appdata';

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
      function(response) {
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
        var batch = gapi.client.newBatch();
        parents.forEach(
          parent => {
            batch.add(
              gapi.client.request({
                'path': `https://www.googleapis.com/drive/v3/files/${parent}`,
                'params': {
                  'fields': 'id,name',
                },
              }),
              {
                id: parent,
              });
          });

        return batch
          .then(
            function(response) {
              console.log(response);
              
              var parentIdToResourceMapping = response.result;
              
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

                    // Extract parents metadata.
                    var parentIdToDirectoryMetadata = new Map();
                    Object.keys(parentIdToResourceMapping)
                      .forEach(parentId => {
                        parentIdToDirectoryMetadata.set(
                          parentId,
                          new DirectoryMetadata(
                            parentId,
                            parentIdToResourceMapping[parentId].result.name));
                      });

                    // Then create arrays of them for files
                    var parents = shotFile.parents.map(
                      parentId => parentIdToDirectoryMetadata.get(parentId));
                    return new ShotFileMetadata(shotFile.id, shotFile.name, parents, datetime);                      
                  })
                .sort(
                  (first, second) => first.datetime.getTime() - second.datetime.getTime());
            },
            function() {
              // Throw.
              console.log('Error: ' + reason);
            }
          );
      },
      function(reason) {
        // Throw.
        console.log('Error: ' + reason);
      }
    );
    this.rpcCache.set(cacheKey, rpcPromise);
    return rpcPromise
      .then(_GapiWrapper.deepCopyFileList);
  }
  
  _makeGetFileContentsCacheKey(fileId) {
    return `${this.activeApiKey},${this.activeClientId},getFileContents,${fileId}`;
  }
  
  // TODO: return a copy
  /** Use once authenticated and authorized. */
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
      },
      function(reason) {
        // Throw
        console.log(reason.result.error.message);
      }
    );
    this.rpcCache.set(cacheKey, rpcPromise);
    return rpcPromise;
  }
}

window.GapiWrapper = new _GapiWrapper();