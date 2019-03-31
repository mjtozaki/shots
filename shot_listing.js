'use strict';
// RoutedShotsList

// withRouter(connect()(ShotsList))

(function(ns = window) {
  class RoutedShotsList extends React.Component {
    componentDidMount() {
      // Fetch
      // TODO: do this without looking directly into auth state.
      if (this.props.auth.clientId !== undefined && this.props.auth.clientSecret !== undefined
          && this.props.auth.refreshToken !== undefined) {
        this.props.fetchShotsList();
      } else {
        this.props.history.replace('/auth');
      }      
    }

    componentDidUpdate(prevProps) {
      this.props.fetchShotsListIfNeeded();
    }
    
    render() {
      return h(ShotsList, {...this.props});
    }
  }
  
  
  let getShots = (shots) => {
    return shots;
  };
  let mapStateToProps = (state) => ({
    auth: state.auth,
    shots: getShots(state.shots),
  });
  let mapDispatchToProps = (dispatch, ownProps) => ({
    fetchShotsList: () => {
      dispatch(fetchShotsList());
    },
    fetchShotsListIfNeeded: () => {
      dispatch(fetchShotsListIfNeeded());
    },
  });
  
  // Exports.
  ns.RoutedShotsList = withRouter(connect(
    mapStateToProps,
    mapDispatchToProps,
  )(RoutedShotsList));  
})();
