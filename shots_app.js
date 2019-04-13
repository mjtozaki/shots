"use strict";

(function(ns = window) {
  // Top-level component for Shots app.
  class ShotsApp extends React.Component {
    render() {
      var children = [
        // Redirects.
        h(Route, {
          path: '/redirect/from/personal/:provider/:shotId/:relativeIndex',
          component: RedirectRelativeFromPersonal,
          key: 'RedirectRelativeFromPersonal'}),
        h(Route, {
          path: '/redirect/index/personal/:provider/:index',
          component: RedirectWithAbsoluteIndex,
          key: 'RedirectWithAbsoluteIndex'}),
        h(Route, {
          path: '/redirect/yesterday',
          component: RedirectYesterday,
          key: 'RedirectYesterday'}),
        // Menu bar.
        h(ShotsMenu, {key: 'ShotsMenu'}),
        // Routing for pages.
        h(Route, {
          exact: true,
          path: '/',
          component: RoutedShotsList,
          key: 'RoutedShotsList'}),
        h(Route, {
          path: '/auth',
          component: RoutedAuthSettings,
          key: 'RoutedAuthSettings'}),
        h(Route, {
          path: '/diagnostics',
          component: Diagnostics,
          key: 'Diagnostics'}),
        h(Route, {
          path: '/personal/:provider/:shotId',
          component: RoutedSingleShotView,
          key: 'RoutedSingleShotView'}),
        h(Route, {
          path: '/public/binary/:shortUrl/:serializedShot',
          component: RoutedByoSingleShotView,
          key: 'RoutedByoSingleShotView'}),
      ];

      return children;
    }
  }

  // Container.
  class AuthSyncedShotsApp extends React.Component {
    constructor(props) {
      super(props);
      // TODO: move this somewhere else. constructor is not supposed to have side-effects.
      this.setAuth();
    }
    setAuth() {
      this.props.setAuth(this.props.auth.clientId, this.props.auth.clientSecret, this.props.auth.refreshToken);
    }
    // TODO: does not work for setting auth because it executes in post traversal order e.g. listing will start before auth is set.
    // Anything put here will after child Routes.
    // componentDidMount() {
    // }

    componentDidUpdate(prevProps) {
      if (this.props.auth.clientId !== prevProps.auth.clientId || this.props.auth.clientSecret !== prevProps.auth.clientSecret
          || this.props.auth.refreshToken !== prevProps.auth.refreshToken) {
        this.setAuth();
      }
    }

    render() {
      return h(ShotsApp, {...this.props});
    }
  }
  
  // Props.
  const getAuth = (stateAuth) => {
    return {...stateAuth};
  };
  const mapStateToProps = (state) => ({
    auth: getAuth(state.auth),
  });
  const mapDispatchToProps = (dispatch, ownProps) => ({
    setAuth: (clientId, clientSecret, refreshToken) => dispatch(setAuth(clientId, clientSecret, refreshToken)),
  });
  
  // Exports.
  ns.AuthSyncedShotsApp = withRouter(connect(
    mapStateToProps,
    mapDispatchToProps,
  )(AuthSyncedShotsApp));

})();
