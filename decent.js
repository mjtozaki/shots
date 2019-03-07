"use strict";

/* Experimenting with builders in js.
 * Based upon:
 *  -http://ryanogles.by/an-exploration-of-javascript-builders/
 *  -https://medium.com/@axelhadfeg/builder-pattern-using-javascript-and-es6-ec1539182e24
 */
class BaseBuilder {
  init() {  
    Object.keys(this).forEach((key) => {
      const setterName = `set${key.substring(0,1).toUpperCase()}${key.substring(1)}`;
      this[setterName] = (value) => {
        this[key] = value;
        return this;
      };
    });
  }

  build() {
    const fields = Object.keys(this).filter((key) => (
      typeof this[key] !== 'function'
    ));
            
    var properties =  fields.reduce((returnValue, key) => {
      return {
        ...returnValue,
        [key]: {
          value: this[key],
          writable: false
        }
      };
    }, {});
    
    var outputObject = {};
    Object.defineProperties(outputObject, properties);
    
    this.addMemberFunctions(outputObject);
    
    return outputObject;
    
//         return keysNoWithers.reduce((returnValue, key) => {
//           return {
//             ...returnValue,
//             [key]: this[key]
//           };
//         }, {});
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
class ShotBuilder extends BaseBuilder {
  constructor() {
    super();
    
    this.timestamp = new Date(0);
    this.elapsed = [];
    this.pressure = [];
    this.flow = [];
    this.weight = [];
    this.flowWeight = [];
    this.temperatureBasket = [];
    this.temperatureMix = [];
    this.temperatureTarget = [];
    this.author = "";

    super.init();
  }
  addMemberFunctions(obj) {
    obj.renderText = function(div) {
      var BR = "<br>";
      var html = 
        "timestamp: " + this.timestamp.toString() + BR
        + "elapsed: " + this.elapsed + BR
        + "pressure: " + this.pressure + BR
        + "flow: " + this.flow + BR
        + "weight: " + this.weight + BR
        + "flowWeight: " + this.flowWeight + BR
        + "temperatureBasket: " + this.temperatureBasket + BR
        + "temperatureMix: " + this.temperatureMix + BR
        + "temperatureTarget" + this.temperatureTarget + BR
        + "author: " + this.author + BR;
      div.innerHTML = html;
    }
    
    // TODO: Move this stuff to polymorphic renderers.
    
    obj.renderPlot = function(plot) {
      var pressure = {
        x: this.elapsed,
        y: this.pressure,
        mode: 'lines',
        name: 'Pressure',
        line: {
          color: 'green'
        }
      };
      var flow = {
        x: this.elapsed,
        y: this.flow,
        mode: 'lines',
        name: 'Flow',
        line: {
          color: 'blue'
        },
        yaxis: 'y2'
      };
      var temperatureBasket = {
        x: this.elapsed,
        y: this.temperatureBasket,
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
          this.temperatureTarget.reduce(
            (accumulator, currentValue) => accumulator + currentValue)
          / this.temperatureTarget.length;
      var maxDifference = [...Array(this.elapsed.length).keys()]
          .map(
            (index) => Math.max(Math.abs(this.temperatureTarget[index] - center), Math.abs(this.temperatureBasket[index] - center)))
          .reduce((accumulator, currentValue) => Math.max(accumulator, currentValue), 0);
      var temperatureRange = [center - maxDifference, center + maxDifference];
      var temperatureTarget = {
        x: this.elapsed,
        y: this.temperatureTarget,
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
        title: `Shot @ ${this.timestamp}`,
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
      Plotly.react(plot, data, layout);
    }
  }
}
function tclListToNumberArray(tclList) {
  return tclList.split(/\s+/).map(numStr => Number(numStr));
}
function shotFromShotFileContents(contents) {
  var S_TO_MS = 1000;
  var attrs = tclArrayDeserializer(contents);
  if (!attrs.has('settings')) {
    throw new ShotSyntaxError("settings key not present.");
  }
  var settings = tclArrayDeserializer(attrs.get('settings'));
  if (!attrs.has('machine')) {
    throw new ShotSyntaxError("machine key not present.");
  }
  var machine = tclArrayDeserializer(attrs.get('machine'));
  
  var espressoElapsed = tclListToNumberArray(attrs.get('espresso_elapsed'));
  var espressoPressure = tclListToNumberArray(attrs.get('espresso_pressure'));
  var espressoWeight = tclListToNumberArray(attrs.get('espresso_weight'));
  var espressoFlow = tclListToNumberArray(attrs.get('espresso_flow'));
  var espressoFlowWeight = tclListToNumberArray(attrs.get('espresso_flow_weight'));
  var espressoTemperatureBasket = tclListToNumberArray(attrs.get('espresso_temperature_basket'));
  var espressoTemperatureMix = tclListToNumberArray(attrs.get('espresso_temperature_mix'));
  
  console.log("espresso_elapsed: " + attrs.get('espresso_elapsed'));
  console.log("espressoElapsed: " + espressoElapsed);
  var numPoints = espressoElapsed.length;
  if (![espressoPressure, espressoWeight, espressoFlow, espressoFlowWeight, espressoTemperatureBasket, espressoTemperatureMix]
      .every(sequence => sequence.length == numPoints)) {
    throw ShotSyntaxError("Number of data points do not match across all dimensions.");
  }

  var builder = new ShotBuilder();
  return builder
    .setTimestamp(
      new Date(Number(attrs.get('clock') * S_TO_MS)))
    .setElapsed(espressoElapsed)
    .setPressure(espressoPressure)
    .setWeight(espressoWeight)
    .setFlow(espressoFlow)
    .setFlowWeight(espressoFlowWeight)
    .setTemperatureBasket(espressoTemperatureBasket)
    .setTemperatureMix(espressoTemperatureMix)
    .setTemperatureTarget(Array(numPoints).fill(Number(settings.get('espresso_temperature'))))
    .setAuthor(settings.get('author'))
    .build();
}


class TclError extends Error {
  constructor(...params) {
    super(...params);
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TclError);
    }
  }
}
var TOKEN_TYPE_EOF = 1;
var TOKEN_TYPE_WORD = 2;
class Token {
  constructor(tokenType, value) {
    this.tokenType = tokenType;
    this.value = value;
  }
}
/** 
 * Processes similar to the following Tcl, where retName is a variable
 * representing the returned value of the function:
 *
 *   upvar 1 $retName arrRef
 *   array set arrRef $arrayString
 *
 * Respects rules 3 and 6 of Tcl. See https://www.tcl.tk/man/tcl/TclCmd/Tcl.htm.
 */
function tclArrayDeserializer(arrayString) {
  // Looks for zero or more pairs of words, where a word is either
  // 1. a sequence of 1 or more non-whitespace characters, or
  // 2. a sequence of characters within a left brace '{' and its matched right brace '}', respecting nested braces.
  // A pair of words is separated by at least one non-newline whitespace characters,
  // and pairs are separated by at least one newline.
  // TODO: implement newline-related restrictions.
  
  // tokens:  (\s+), (\n), ([a-zA-Z0-9_]+), ({), (})
  var tokenizer = new Tokenizer(arrayString);
  var tclArray = new Map();
  while (1) {
    var token = tokenizer.nextToken();
    if (token.tokenType == TOKEN_TYPE_EOF) {
      break;
    }
    var key = token.value;
    token = tokenizer.nextToken();
    if (token.tokenType == TOKEN_TYPE_EOF) {
      throw new TclError("Serialized Tcl arrays should have an even number of elements.");
    }
    tclArray.set(key, token.value);
  }
  return tclArray;
}
class Tokenizer {
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
  eatWhitespace() {
    while (this.pos < this.str.length && Tokenizer.isWhitespace(this.str.charAt(this.pos))) {
      ++this.pos;
    }
  }
  extractWord() {
    var origin = this.pos;
     while (this.pos < this.str.length && Tokenizer.isWordChar(this.str.charAt(this.pos))) {
       ++this.pos;
     }
    return this.str.substring(origin, this.pos);
  }
  extractBracedWord() {
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
  nextToken() {
    this.eatWhitespace();
    
    if (this.pos >= this.str.length) {
      return new Token(TOKEN_TYPE_EOF, undefined);
    }
    var ch = this.str.charAt(this.pos);
    if (Tokenizer.isWordChar(ch)) {
      return new Token(TOKEN_TYPE_WORD, this.extractWord());
    } else if (ch === '{') {
      return new Token(TOKEN_TYPE_WORD, this.extractBracedWord());
    } else {
      throw new TclError("Unexpected token '" + ch + "' at pos " + this.pos + ".");
    }
  }
}