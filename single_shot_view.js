'use strict';

(function(ns = window) {
  //const LIST_SHELF_LIFE = 1 * 60 * 1000; // 60s.

  class RoutedSingleShotView extends React.Component {
    componentDidMount() {
      // Fetch
      // TODO: do this without looking directly into auth state.
      if (this.props.auth.clientId !== undefined && this.props.auth.clientSecret !== undefined
          && this.props.auth.refreshToken !== undefined) {
        this.props.fetchShot(this.props.match.params.provider, this.props.match.params.shotId);
      } else {
        this.props.history.replace('/auth');
      }
      
    }

    componentDidUpdate(prevProps) {
      this.props.fetchShotIfNeeded(this.props.match.params.provider, this.props.match.params.shotId);
    }
    
    render() {
      return h(SingleShotView, {...this.props});
    }
  }
  
  
  let getShot = (shot) => {
    return shot;
  };
  let mapStateToProps = (state) => ({
    auth: state.auth,
    shot: getShot(state.shot),
  });
  let mapDispatchToProps = (dispatch, ownProps) => ({
    fetchShot: (provider, shotId) => {
      dispatch(fetchShot(provider, shotId));
    },
    fetchShotIfNeeded: (provider, shotId) => {
      dispatch(fetchShotIfNeeded(provider, shotId));
    },
  });
  
  // Exports.
  ns.RoutedSingleShotView = withRouter(connect(
    mapStateToProps,
    mapDispatchToProps,
  )(RoutedSingleShotView));
  
  
  // Byo shot.
  
  class RoutedByoSingleShotView extends React.Component {
    componentDidMount() {
      this.props.deserializeShot(this.props.match.params.serializedShot);
    }
    componentDidUpdate(prevProps) {
      if (this.props.match.params.serializedShot !== prevProps.match.params.serializedShot) {
        this.componentDidMount();
      }
    }
    render() {
      return h(SingleShotView, {...this.props});
    }
  }
  let byoMapStateToProps = (state) => ({
    byo: true,
    shot: getShot(state.shot),
  });
  let byoMapDispatchToProps = (dispatch, ownProps) => ({
    deserializeShot: (serializedShot) => dispatch(deserializeShot(serializedShot)),
  });
  ns.RoutedByoSingleShotView = withRouter(connect(
    byoMapStateToProps,
    byoMapDispatchToProps,
  )(RoutedByoSingleShotView));

})();
