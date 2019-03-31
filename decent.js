"use strict";

class ShotCodec {
  constructor() {}

  getShotFromFileContents(contents, shotFile) {
    var S_TO_MS = 1000;
    var attrs = TclCodec.deserializeTclArray(contents);
    if (!attrs.has('settings')) {
      throw new ShotSyntaxError("settings key not present.");
    }
    var settings = TclCodec.deserializeTclArray(attrs.get('settings'));
    if (!attrs.has('machine')) {
      throw new ShotSyntaxError("machine key not present.");
    }
    var machine = TclCodec.deserializeTclArray(attrs.get('machine'));
    
    var espressoElapsed = TclCodec.tclListToNumberArray(attrs.get('espresso_elapsed'));
    var espressoPressure = TclCodec.tclListToNumberArray(attrs.get('espresso_pressure'));
    var espressoWeight = TclCodec.tclListToNumberArray(attrs.get('espresso_weight'));
    var espressoFlow = TclCodec.tclListToNumberArray(attrs.get('espresso_flow'));
    var espressoFlowWeight = TclCodec.tclListToNumberArray(attrs.get('espresso_flow_weight'));
    var espressoTemperatureBasket = TclCodec.tclListToNumberArray(attrs.get('espresso_temperature_basket'));
    var espressoTemperatureMix = TclCodec.tclListToNumberArray(attrs.get('espresso_temperature_mix'));
    
    var numPoints = espressoElapsed.length;
    if (![espressoPressure, espressoWeight, espressoFlow, espressoFlowWeight, espressoTemperatureBasket, espressoTemperatureMix]
        .every(sequence => sequence.length == numPoints)) {
      throw ShotSyntaxError("Number of data points do not match across all dimensions.");
    }

    let shotData = {
      timestamp: new Date(Number(attrs.get('clock') * S_TO_MS)),
      elapsed: espressoElapsed,
      pressure: espressoPressure,
      weight: espressoWeight,
      flow: espressoFlow,
      flowWeight: espressoFlowWeight,
      temperatureBasket: espressoTemperatureBasket,
      temperatureMix: espressoTemperatureMix,
      temperatureTarget: new Array(numPoints).fill(Number(settings.get('espresso_temperature'))),
      author: settings.get('author'),
      // TODO: maybe this should go in a different layer. Clear separation between shot DATA and shot METADATA.
      filename: shotFile.name,
      parentPath: shotFile.parent.path,
    };
    console.log(shotData);
    return shotData;
  }
}

class ShotSyntaxError extends Error {
  constructor(...params) {
    super(...params);
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ShotSyntaxError);
    }
  }
}

/** Helps with data encoded in Tcl. */
class TclCodec {
  /** 
   * Processes similar to the following Tcl, where retName is a variable
   * representing the returned value of the function:
   *
   *   upvar 1 $retName arrRef
   *   array set arrRef $arrayString
   *
   * Respects rules 3 and 6 of Tcl. See https://www.tcl.tk/man/tcl/TclCmd/Tcl.htm.
   */
  static deserializeTclArray(arrayString) {
    // Looks for zero or more pairs of words, where a word is either
    // 1. a sequence of 1 or more non-whitespace characters, or
    // 2. a sequence of characters within a left brace '{' and its matched right brace '}', respecting nested braces.
    // A pair of words is separated by at least one non-newline whitespace characters,
    // and pairs are separated by at least one newline.
    // TODO: implement newline-related restrictions.
    
    // tokens:  (\s+), (\n), ([a-zA-Z0-9_]+), ({), (})
    var tokenizer = new TclTokenizer(arrayString);
    var tclArray = new Map();
    while (1) {
      var token = tokenizer.nextToken();
      if (token.tokenType == TclTokenizer.TOKEN_TYPE_EOF) {
        break;
      }
      var key = token.value;
      token = tokenizer.nextToken();
      if (token.tokenType == TclTokenizer.TOKEN_TYPE_EOF) {
        throw new TclError("Serialized Tcl arrays should have an even number of elements.");
      }
      tclArray.set(key, token.value);
    }
    return tclArray;
  }
  
  static tclListToNumberArray(tclList) {
    return tclList.split(/\s+/).map(numStr => Number(numStr));
  }
}

class TclError extends Error {
  constructor(...params) {
    super(...params);
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TclError);
    }
  }
}

/**
 * Tokenizes Tcl. Limited to distinguishing between words and EOF, ignoring whitespace.
 * Words supported are:
 *   contiguous sequences of "word" characters
 *   block enclosed by matching curly braces.
 */
class TclTokenizer {
  constructor(str) {
    this.str = str;
    this.pos = 0;
  }
  static isWhitespace(ch) {
    return /\s/.test(ch);
  }
  static isWordChar(ch) {
    return /[a-zA-Z0-9_#:\.+-]/.test(ch);
  }
  _eatWhitespace() {
    while (this.pos < this.str.length && TclTokenizer.isWhitespace(this.str.charAt(this.pos))) {
      ++this.pos;
    }
  }
  _extractWord() {
    var origin = this.pos;
     while (this.pos < this.str.length && TclTokenizer.isWordChar(this.str.charAt(this.pos))) {
       ++this.pos;
     }
    return this.str.substring(origin, this.pos);
  }
  _extractBracedWord() {
    var origin = this.pos;
    var depth = 0;
    do {
      var ch = this.str.charAt(this.pos);
      if (ch === '{') {
        ++depth;
      } else if (ch === '}') {
        --depth;
      }
      ++this.pos;
    } while (this.pos < this.str.length && depth != 0);
    if (depth != 0) {
      throw new TclError("Unmatched curly braces.");
    }
    return this.str.substring(
      origin+1, // Skip the '{'.
      this.pos-2); // End before the '}'.
  }

  /**
   * Returns a token object
   *   tokenType: type of token. See TclTokenizer.TOKEN_TYPE_*.
   *   value: value of the token.
   */
  nextToken() {
    this._eatWhitespace();
    
    if (this.pos >= this.str.length) {
      return {tokenType: TclTokenizer.TOKEN_TYPE_EOF};
    }
    var ch = this.str.charAt(this.pos);
    if (TclTokenizer.isWordChar(ch)) {
      return {tokenType: TclTokenizer.TOKEN_TYPE_WORD, value: this._extractWord()};
    } else if (ch === '{') {
      return {tokenType: TclTokenizer.TOKEN_TYPE_WORD, value: this._extractBracedWord()};
    } else {
      throw new TclError("Unexpected token '" + ch + "' at pos " + this.pos + ".");
    }
  }
}

TclTokenizer.TOKEN_TYPE_EOF = 1;
TclTokenizer.TOKEN_TYPE_WORD = 2;
