"use strict";

/**
 * Cache entry by category. Categories dictate expiration times and maximum item limits.
 * May delete expired items when using get(). Deletes items FIFO when maximum item limit reached.
 * e.g. parents name lookup cache should be forever (unlikely a folder will be renamed)
 * e.g. shot file contents should be limited to something like 10 elements. And cache duration should be forever.
 */
class _TimedCache {
  /**
   * Args:
   *   config: object
   *     categories: [object]
   *       name: category name.
   *       shelfLife: ms until expired. undefined means never expires.
   *       quantity: # elements cached. undefined means no limit.
   */
  constructor(config, defaultShelfLife=_TimedCache.DEFAULT_SHELF_LIFE) {
    // this.cacheDuration = cacheDuration;
    this.table = new Map();
    this.categories = new Map();
    config.categories.forEach(category => {
      this.categories.set(category.name, {
        shelfLife: category.shelfLife,
        spaceRemaining: category.quantity,
        // Maintain linked list 
        head: _TimedCache.EMPTY_POINTER,
        tail: _TimedCache.EMPTY_POINTER,
      });
    });
    this._defaultShelfLife = defaultShelfLife;
  }

  _has(key) {
    if (this.table.has(key)) {
      var current = this.table.get(key);
      if (Date.now() < current.expiresAt) {
        return true;
      }
      var category = current.category;
      // This and all elements before it are toast.
      while (category.head !== current.next) {
        this.table.delete(category.head.key);
        ++category.spaceRemaining;
        category.head = category.head.next;
      }
      if (category.head === _TimedCache.EMPTY_POINTER) {
        // Tail was obliterated. Update it.
        category.tail = _TimedCache.EMPTY_POINTER;
      }
    }
    return false;
  }
  get(key) {
    if (this._has(key)) {
      return this.table.get(key).value;
    }
    return null;
  }
  set(key, value, categoryName) {
    if (!this.categories.has(categoryName)) {
      throw "Category doesn't exist."
    }
    var category = this.categories.get(categoryName);
    // For updates, need to extract existing entry from FIFO.
    if (this.table.has(key)) {
      var prev = this.table.get(key).prev;
      var next = this.table.get(key).next;
      if (prev === _TimedCache.EMPTY_POINTER) {
        // This is head.
        category.head = next;
      } else {
        prev.next = next;
      }
      if (next === _TimedCache.EMPTY_POINTER) {
        // This is tail.
        category.tail = prev;
      } else {
        next.prev = prev;
      }
      ++category.spaceRemaining;
    }
    var current = {
      key: key, // For look-up during delete upon expiration.
      value: value,
      expiresAt: this._getExpirationTime(category.shelfLife),
      category: category, // For category management during get.
      prev: category.tail,
      next: _TimedCache.EMPTY_POINTER,
    };
    this.table.set(key, current);
    // Update tail.
    if (category.tail !== _TimedCache.EMPTY_POINTER) {
      category.tail.next = current;
    }
    category.tail = current;
    // Update head.
    if (category.head === _TimedCache.EMPTY_POINTER) {
      category.head = current;
    }
    // Remove head element if we've gone over budget.
    if (--category.spaceRemaining < 0) {
      category.head = category.head.next;
      ++category.spaceRemaining;
    }
  }
  _getExpirationTime(shelfLife) {
    var expiresAt = Date.now();
    expiresAt += (shelfLife !== undefined) ? shelfLife : this._defaultShelfLife;
    return expiresAt;
  }
}

// Used as the empty pointer in the cache linked list.
_TimedCache.EMPTY_POINTER = {};
// Default is 25d.
_TimedCache.DEFAULT_SHELF_LIFE = 2147483648;

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
    // this.activeApiKey = null;
    this.activeClientId = null;
    this.activeClientSecret = null;
    this.activeRefreshToken = null;
    this.activeAccessToken = null;
    this.activeExpirationTime = 0;
    // this.acquiringApiKey = null;
    this.acquiringClientId = null;
    this.acquiringClientSecret = null;
    this.acquiringRefreshToken = null;
    this.whenAuthed = null;
    this.whenClientAndAuthLoaded = null;
    const CACHE_DURATION = 1 * 60 * 1000; // Minutes.
    this.rpcCache = new _TimedCache({
      categories: [
        {
          name: 'dirs',
          // Unlimited shelf life and items.
        },
        {
          name: _GapiWrapper._GET_FILE_CONTENTS_CACHE_CATEGORY,
          // Unlimited shelf life.
          quantity: 20, // TODO: specify in bytes.
        },
        {
          name: _GapiWrapper._LISTING_CACHE_CATEGORY,
          shelfLife: 60*1000,
          quantity: 5, // 5 different types of listings?
        },
      ],
    }, CACHE_DURATION);
    
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
  
  
  // ensureApiKeyAndClientIdAuthed(apiKey, clientId) {
  ensureAuthed(clientId, clientSecret, refreshToken) {
    // TODO: refactor
    var SCOPE = 'https://www.googleapis.com/auth/drive';

    // TODO: also check that another api/client hasn't begun auth.
    // if (this.activeApiKey === apiKey && this.activeClientId === clientId) {
    if (this.activeClientId === clientId && this.activeClientSecret === clientSecret
        && this.activeRefreshToken === refreshToken && Date.now() < this.activeExpirationTime) {
      return Promise.resolve(true);
    }
    
    // if (this.acquiringApiKey === apiKey && this.acquiringClientId === clientId && this.whenApiKeyAndClientIdAuthed !== null) {
    if (this.acquiringClientId === clientId && this.acquiringClientSecret === clientSecret
        && this.acquiringRefreshToken === refreshToken && this.whenAuthed !== null) {
      return this.whenAuthed;
    }
    
    // this.acquiringApiKey = apiKey;
    this.acquiringClientId = clientId;
    this.acquiringClientSecret = clientSecret;
    this.acquiringRefreshToken = refreshToken;
    
    // Refresh token.
    this.whenAuthed = new Promise(resolve => {
      const refreshAccessTokenUri = 'https://www.googleapis.com/oauth2/v4/token';
      let xhr = new XMLHttpRequest();
      xhr.responseType = 'json';
      xhr.open("POST", refreshAccessTokenUri, true);
      xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
      xhr.onreadystatechange = function() {
        if (this.readyState === XMLHttpRequest.DONE) {
          resolve(this);
        }
      };
      xhr.send(
        `client_id=${clientId}&` +
        `client_secret=${clientSecret}&` +
        `refresh_token=${refreshToken}&` +
        `grant_type=refresh_token`);
    })
      .then(xhr => {
        if (xhr.status === 200) {
          var response = xhr.response;
          if (response.access_token !== undefined) {
            return Promise.all([response.access_token, response.expires_in, this.ensureClientAndAuthLoaded]);

          } else {
            throw 'Refresh token was not sent. Response: ' + Object.entries(response);
          }
        } else {
          throw `Failed to refresh access token. readyState=${xhr.readyState}, status=${xhr.status}`;
        }        
      })
      .then(([accessToken, expiresIn]) => {
        // Init client.
        return gapi.client.init({
          // 'apiKey': apiKey,
          // 'clientId': clientId,
          // 'scope': SCOPE,
        })
          .then(() => { // Naughty nesting to pass the variable.
            gapi.client.setToken({
              access_token: accessToken,
            });
            
            // We should now be "signed in".
            
            const S_TO_MS = 1000;
            const M_TO_S = 60;
            const EXPIRATION_BUFFER = 5 * M_TO_S * S_TO_MS;
            
            this.activeClientId = clientId;
            this.activeClientSecret = clientSecret;
            this.activeRefreshToken = refreshToken;
            this.activeAccessToken = accessToken;
            this.activeExpirationTime = Date.now() + expiresIn * S_TO_MS - EXPIRATION_BUFFER;
            this.whenAuthed = null;
          });
      })

    return this.whenAuthed;
    
    // this.whenAuthed =
      // this.ensureClientAndAuthLoaded()
      // .then(
        // // Init client.
        // function() {
          // return gapi.client.init({
            // 'apiKey': apiKey,
            // 'clientId': clientId,
            // 'scope': SCOPE,
          // });
        // },
        // function() {
          // // Throw.
        // }
      // )
      // .then(
        // // Ensure signed in.
        // function() {
          // var needToSignIn = true;
          // var GoogleAuth = gapi.auth2.getAuthInstance();
          // if (GoogleAuth.isSignedIn.get()) {
            // var user = GoogleAuth.currentUser.get();
            // var isAuthorized = user.hasGrantedScopes(SCOPE);
            // if (!isAuthorized) {
              // console.log("Signed in and not authorized.");
            // } else {
              // needToSignIn = false;
              // console.log("Signed in and authorized!");
            // }
          // } else {
            // console.log("Not signed in.");
          // }
          // if (needToSignIn) {
            // return GoogleAuth.signIn();
          // }
          // return Promise.resolve(true);
        // },
        // function() {
          // // Throw.
        // }
      // )
      // .then(
        // // Record that we are signed in.
        // () => {
          // // TODO: check that acquiring is same as local key and client id. If not, then do not record?
          // this.activeApiKey = apiKey;
          // this.activeClientId = clientId;
        // },
        // function() {
          // // Throw
          // console.log('signIn() failed apparently.');
        // }
      // );
    // return this.whenAuthed;
  }
  
  _makeCacheKeyPrefixForAuth() {
    // return `${this.activeApiKey},${this.activeClientId},`;
    // TODO: maybe this should be a unique user ID instead of the input to auth.
    return `${this.activeClientId},${this.activeClientSecret},${this.activeRefreshToken},`;
  }
  
  _makeCacheKeyForDir(fileId) {
    return this._makeCacheKeyPrefixForAuth() + `dir,${fileId}`;
  }
  
  async getFile(fileId) {
    // TODO: cache.
    let response = await gapi.client.request({
      path: `https://www.googleapis.com/drive/v3/files/${fileId}`,
      params: {
        fields: 'name,parents',
      },
    });
    
    if (response.error !== undefined) {
      throw response.error.errors[0].message;
    }

    // TODO: refactor. this is basically a copy/paste of listFiles.
    let file = response.result;
    
    if (file.parents === undefined || file.parents.length === 0) {
      return {
        id: file.id,
        name: file.name,
        parent: {path: '/'},
      };
      
    } else {
      let parents = [file.parents[0]];
      let parentsById = await this._getDirectoryPaths(parents);
      return {
        id: file.id,
        name: file.name,
        parent: parentsById.get(file.parents[0]),
      };
    }
  }

  
  async _getDirectoryPaths(requestedParentIds) {
    // Copy to prevent modification of arg.
    var parentIds = new Set(requestedParentIds);
    
    var directories = new Map();
    parentIds.forEach(parentId => {
      var cache = this.rpcCache.get(this._makeCacheKeyForDir(parentId));
      if (cache !== null) {
        directories.set(parentId, cache);
        parentIds.delete(parentId);
      }
    });
    
    // Each look-up stage represents a level up the tree.
    while (parentIds.size > 0) {
      var batch = gapi.client.newBatch();
      // Queue up queries for this parents at this depth.
      parentIds.forEach(parentId => {
        batch.add(
          gapi.client.request({
            'path': `https://www.googleapis.com/drive/v3/files/${parentId}`,
            'params': {
              'fields': 'name,parents',
            },
          }),
          {
            id: parentId,
          });
      });
      // Remove the current query parents from the queue.
      parentIds.clear();

      var response = await batch;
      if (response.error !== undefined) {
        throw response.error.errors[0].message;
      }
      var idToFileMapping = response.result;
      // Record files by fileId, and add the next level of parents.
      Object.keys(idToFileMapping)
        .forEach(fileId => {
          var file = idToFileMapping[fileId].result;
          directories.set(fileId, file);
          this.rpcCache.set(this._makeCacheKeyForDir(fileId), file, 'dirs');
          if (file.parents !== undefined && file.parents.length > 0) { // Root (e.g. "My Drive") has undefined parents.
            parentIds.add(file.parents[0]);
          }
          /////////////////////
          // var name = idToFileMapping[fileId].result.name;
          // var cacheKey = this._makeNameForFileIdCacheKey(fileId);
          // this.rpcCache.set(cacheKey, name);
          // results.set(fileId, name);
        });
      // Ignore parentIds that were already looked-up.
      parentIds.forEach(parentId => {
        if (directories.has(parentId)) {
          parentIds.delete(parentId);
        }
      }); 
    }
    
    // Construct the paths for the requested parents.
    var result = new Map();
    requestedParentIds.forEach(leafId => {
      var path = [];
      var directoryId = leafId;
      while (directories.has(directoryId)) {
        var directory = directories.get(directoryId);
        path.unshift(directory.name);
        directoryId = (directory.parents !== undefined && directory.parents.length > 0) ? directory.parents[0] : undefined;
      }
      // TODO: consider making path an array of dirs for more flexibility. 
      path = "/" + path.join("/");
      result.set(leafId, {
        id: leafId,
        path: path,
      });
    });
    return result;
  }
  
  _makeCacheKeyForListFiles(q, orderBy, pageSize, pageToken) {
    return this._makeCacheKeyPrefixForAuth() + `listFiles,${q},${orderBy},${pageSize},${pageToken}`;
  }

  async listFiles(q, orderBy, pageSize, pageToken) {
    var response;
    
    var cacheKey = this._makeCacheKeyForListFiles(q, orderBy, pageSize, pageToken);
    var cached = this.rpcCache.get(cacheKey);
    if (cached !== null) {
      // TODO: protect from modification by client.
      response = cached;
    } else {
      response = await gapi.client.request({
        path: 'https://www.googleapis.com/drive/v3/files',
        params: {
          spaces: 'drive',
          q: q,
          fields: 'nextPageToken,files(id,name,parents)',
          orderBy: orderBy,
          pageSize: pageSize,
          pageToken: pageToken,
        },
      });
    }

    if (response.error !== undefined) {
      if (response.error.errors !== undefined && response.error.errors[0].location === 'pageToken') {
        throw new GapiPageTokenError(response.error.errors[0].message);
      }
      throw new GapiError(response.error.errors[0].message);
    }
    
    this.rpcCache.set(cacheKey, response, _GapiWrapper._LISTING_CACHE_CATEGORY);
    var files = response.result.files;
    
    // We will only respect the first parent of each file.
    var parents = new Set(
      files
        .map(file => file.parents[0]));
    // Get paths for the parents.
    var parentsById = await this._getDirectoryPaths(parents);
    
    var filesWithPaths = files.map(file => {
      var fileWithPath = {
        id: file.id,
        name: file.name,
        parent: parentsById.get(file.parents[0]),
      };
      return fileWithPath;
    });
    
    return [filesWithPaths, response.nextPageToken];
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
  
  _makeCacheKeyForGetFileContents(fileId) {
    return this._makeCacheKeyPrefixForAuth() + `getFileContents,${fileId}`;
  }
  
  // TODO: return a copy
  /**
   * Returns file contents.
   * Use once authenticated and authorized.
   */
  async getFileContents(fileId) {
    // TODO: implement cache size constraints to avoid cache getting too big.
    var cacheKey = this._makeCacheKeyForGetFileContents(fileId);
    var cached = this.rpcCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    var response = await gapi.client.request({
      'path': 'https://www.googleapis.com/drive/v3/files/' + fileId,
      'params': {
         'alt': 'media',
      },
    });
    
    if (response.error !== undefined) {
      throw response.error.errors[0].message;
    }
    
    this.rpcCache.set(cacheKey, response.body, _GapiWrapper._GET_FILE_CONTENTS_CACHE_CATEGORY);
    return response.body;
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

_GapiWrapper._LISTING_CACHE_CATEGORY = 'listing';
_GapiWrapper._GET_FILE_CONTENTS_CACHE_CATEGORY = 'file_contents';


class GapiError extends Error {
  constructor(...params) {
    super(...params);
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GapiError);
    }
  }
}

class GapiPageTokenError extends Error {
  constructor(...params) {
    super(...params);
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GapiError);
    }
  }
}




window.GapiWrapper = new _GapiWrapper();
