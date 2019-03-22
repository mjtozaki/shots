'use strict';

/**
 * Based on https://github.com/nodeca/pako/blob/master/lib/inflate.js
 */
class ShotSerializer {
  constructor() {}
  
  // TODO: serialization versioning has to be coupled to the shot data schema!!!
  
  serializeForUri(shotData) {
    // Attach version information.
    let version = ShotSerializer._DEFAULT_SERIALIZATION_VERSION;
    
    if (ShotSerializer._VERSION_TO_PROCESS_FUNCTION[version] === undefined) {
      throw `Version ${version} not recognized.`
    }
    let forwardProcessing = ShotSerializer._VERSION_TO_PROCESS_FUNCTION[version].forward;
    let compress = ShotSerializer._VERSION_TO_PROCESS_FUNCTION[version].compress;
        
    let serialized = compress(forwardProcessing(shotData));
    
    // Prepend version information. This can never change.
    // Format in regexp: ([1-9][0-9]*(\.[0-9]+)+)_(.+)
    // Today we only support 1 dot.
    // Where first parentheses surround the version number, and last parentheses surround the compressed data.
    serialized = version + '_' + serialized;
    return serialized;
  }
  
  deserializeFromUri(serialized) {
    let endOfVersion = serialized.indexOf('_');
    let version = serialized.substring(0, endOfVersion);
    
    if (ShotSerializer._VERSION_TO_PROCESS_FUNCTION[version] === undefined) {
      throw `Version ${version} not recognized.`
    }

    let backwardProcessing = ShotSerializer._VERSION_TO_PROCESS_FUNCTION[version].backward;
    let decompress = ShotSerializer._VERSION_TO_PROCESS_FUNCTION[version].decompress;
    
    return backwardProcessing(decompress(serialized));
  }

  /**
   * btoa but with the following mappings to prevent inefficiencies with encodeURIComponent:
   *  +  ->  -
   *  /  ->  _
   *  =  ->  .
   *
   * Reference: https://stackoverflow.com/questions/11449577/why-is-base64-encode-adding-a-slash-in-the-result
   */
  static _safeBtoa(str) {
    let unsafeBase64String = btoa(str);
    let safeBase64String = [...unsafeBase64String]
      .map(ch => ch === '+' ? '-' : ch === '/' ? '_' : ch === '=' ? '.' : ch)
      .join('');
    return safeBase64String;
    // TODO: if this is too slow (should be negligible), just make a lookup table.
  }
  
  /** Reverse mapping of safeBtoa. */
  static _safeAtob(safeBase64String) {
    let unsafeBase64String = [...safeBase64String]
      .map(ch => ch === '-' ? '+' : ch === '_' ? '/' : ch === '.' ? '=' : ch)
      .join('');
    let str = atob(unsafeBase64String);
    return str;
  }

  /**
   * Takes a UTF8 string and compresses to base64 format safe for URIs without encoding.
   * Dependencies:
   *   pako 1.3
   */ 
  static _compressAndConvertToBase64(utf8String) {
    // Compress.
    let compressedAsBinaryString = pako.deflate(utf8String, {to: 'string'});
    
    // Base64.
    let compressedBase64 = ShotSerializer._safeBtoa(compressedAsBinaryString);
    return compressedBase64;
    
    // TODO: compare proto wire format to json stringify
  }
  
  /**
   * Dependencies:
   *   pako 1.3
   */ 
  static _decompressFromBase64(compressedBase64) {
    let utf8String =       
      pako.inflate(
        ShotSerializer._safeAtob(compressedBase64),
        {to: 'string'});
    return utf8String;
  }
  
  static _version1_0ForwardProcessing(shotData) {
    // Version 1.0: do nothing.
        // Serialize.
    let json = JSON.stringify(shotData);
    let utf8String = unescape(encodeURIComponent(json));
    

    return utf8String;
  }
  
  static _version1_0BackwardProcessing(utf8String) {
    // Version 1.0: do nothing.
    let obj = JSON.parse(
        decodeURIComponent(
          escape(utf8String)));
    return obj;
  }
}

ShotSerializer._DEFAULT_SERIALIZATION_VERSION = "1.0";

// forward/backward are meant to prepare data before compression/after decompression.
// compress/decompress are meant to affect compression technique, preserving data given to them.
// forward/compress are decoupled to allow maximum reuse of functions between versions.
ShotSerializer._VERSION_TO_PROCESS_FUNCTION = {
  ["1.0"]: {
    forward: ShotSerializer._version1_0ForwardProcessing,
    backward: ShotSerializer._version1_0BackwardProcessing,
    compress: ShotSerializer._compressAndConvertToBase64,
    decompress: ShotSerializer._decompressFromBase64,
  },
  // TODO: in future version, increase efficiency: map key literals to aliases e.g. 'elapsed' to 'a', 'pressure' to 'b', etc.
}