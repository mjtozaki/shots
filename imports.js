"use strict";

// React dom aliases.
const a = rhh.a;
const br = rhh.br;
const button = rhh.button;
const div = rhh.div;
const form = rhh.form;
const h = rhh.h;
const h2 = rhh.h2;
const h3 = rhh.h3;
const input = rhh.input;
const label = rhh.label;
const span = rhh.span;

// React Router aliases.
const Router = window.ReactRouterDOM.HashRouter;
const Route =  window.ReactRouterDOM.Route;
const Link =  window.ReactRouterDOM.Link;
const withRouter = window.ReactRouterDOM.withRouter;
//const Prompt =  window.ReactRouterDOM.Prompt;
//const Switch = window.ReactRouterDOM.Switch;
//const Redirect = window.ReactRouterDOM.Redirect;

// Redux
const applyMiddleware = window.Redux.applyMiddleware;
const createStore = window.Redux.createStore;
const combineReducers = window.Redux.combineReducers;

// React Redux.
const connect = window.ReactRedux.connect;
const Provider = window.ReactRedux.Provider;

// Redux actions.
const createAction = window.ReduxActions.createAction;

// Redux Thunk.
const thunk = window.ReduxThunk.default;

// Redux Form.
const reduxForm = window.ReduxForm.reduxForm;
const Field = window.ReduxForm.Field;

// Plotly.
const Plot = createPlotlyComponent(Plotly);

// From https://stackoverflow.com/a/2117523
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}
