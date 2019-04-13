"use strict";

(function(ns = window) {

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
    this.apiQueryCount = 0;
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
  }
  
  getApiQueryCount() {
    return this.apiQueryCount;
  }
  
  ensureClientAndAuthLoaded() {
    if (this.whenClientAndAuthLoaded !== null) {
      return this.whenClientAndAuthLoaded;
    }
    
    this.whenClientAndAuthLoaded = new Promise(
      resolve => gapi.load('client:auth2', resolve));
    return this.whenClientAndAuthLoaded;
  }
  
  
  ensureAuthed(clientId, clientSecret, refreshToken) {
    // TODO: refactor
    var SCOPE = 'https://www.googleapis.com/auth/drive';

    // TODO: also check that another api/client hasn't begun auth.
    if (this.activeClientId === clientId && this.activeClientSecret === clientSecret
        && this.activeRefreshToken === refreshToken && Date.now() < this.activeExpirationTime) {
      return Promise.resolve(true);
    }
    
    if (this.acquiringClientId === clientId && this.acquiringClientSecret === clientSecret
        && this.acquiringRefreshToken === refreshToken && this.whenAuthed !== null) {
      return this.whenAuthed;
    }
    
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
      ++this.apiQueryCount;
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
        return gapi.client.init({})
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
    ++this.apiQueryCount;
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
        ++this.apiQueryCount;
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
      ++this.apiQueryCount;
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
        .flatMap(file => {
          if (file.parents !== undefined) {
            return [file.parents[0]];
          }
          return [];
        }));
    // Get paths for the parents.
    var parentsById = await this._getDirectoryPaths(parents);
    
    const nullParent = {id: 'unknown', path: 'no_parents'};
    var filesWithPaths = files.map(file => {
      var fileWithPath = {
        id: file.id,
        name: file.name,
        parent: file.parents !== undefined ? parentsById.get(file.parents[0]) : nullParent,
      };
      return fileWithPath;
    });
    
    return [filesWithPaths, response.result.nextPageToken];
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
    
    ++this.apiQueryCount;
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
  
  
  
  // TODO: Redo all this.
  
  /** 
   * range should be the sheet name and cells to set.
   * values should be a two-dimensional area representing rows of columns of cells.
   */
  setSheetValues(spreadsheetId, range, values) {
    ++this.apiQueryCount;
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
    ++this.apiQueryCount;
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

// Exports.
ns.GapiError = GapiError;
ns.GapiPageTokenError = GapiPageTokenError;
ns.GapiWrapper = new _GapiWrapper(); // Singleton.

})();
