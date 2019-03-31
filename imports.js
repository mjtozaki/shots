"use strict";

// React aliases.
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

const connect = window.ReactRedux.connect;
const Provider = window.ReactRedux.Provider;


const applyMiddleware = window.Redux.applyMiddleware;
const createStore = window.Redux.createStore;
const combineReducers = window.Redux.combineReducers;

const createAction = window.ReduxActions.createAction;

const reduxForm = window.ReduxForm.reduxForm;
const Field = window.ReduxForm.Field;


const Plot = createPlotlyComponent(Plotly);
//const Plot = plotComponentFactory(Plotly);

const thunk = window.ReduxThunk.default;