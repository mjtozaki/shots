'use strict';

(function(ns = window) {

// lazy. Using same map functions for all redirect containers.
const mapStateToProps = state => ({
  redirect: state.redirect,
});
const mapDispatchToProps = (dispatch, ownProps) => ({
  redirectRelative: (provider, shotId, relativeIndex, history) => {
    dispatch(redirectRelative(provider, shotId, relativeIndex, history));
  },
  redirectAbsolute: (provider, index, history) => {
    dispatch(redirectAbsolute(provider, index, history));
  },
  redirectYesterday: (history) => {
    dispatch(redirectYesterday(history));
  },
});

class RedirectRelativeFromPersonal extends React.Component {
  componentDidMount() {
    // Fetch
    this.props.redirectRelative(
      this.props.match.params.provider,
      this.props.match.params.shotId,
      this.props.match.params.relativeIndex,
      this.props.history);
  }

  componentDidUpdate(prevProps) {
    if (this.props.redirect.fetching !== true) {
      this.componentDidMount();
    }
  }
  
  render() {
    return [];
  }
};

ns.RedirectRelativeFromPersonal = withRouter(connect(
  mapStateToProps,
  mapDispatchToProps
)(RedirectRelativeFromPersonal));

class RedirectWithAbsoluteIndex extends React.Component {
  componentDidMount() {
    // Fetch
    this.props.redirectAbsolute(
      this.props.match.params.provider,
      this.props.match.params.index,
      this.props.history);
  }

  componentDidUpdate(prevProps) {
    if (this.props.redirect.fetching !== true) {
      this.componentDidMount();
    }
  }
  
  render() {
    return [];
  }
};

ns.RedirectWithAbsoluteIndex = withRouter(connect(
  mapStateToProps,
  mapDispatchToProps
)(RedirectWithAbsoluteIndex));

class RedirectYesterday extends React.Component {
  componentDidMount() {
    // Fetch
    this.props.redirectYesterday(this.props.history);
  }

  componentDidUpdate(prevProps) {
    if (this.props.redirect.fetching !== true) {
      this.componentDidMount();
    }
  }
  
  render() {
    return [];
  }
};

ns.RedirectYesterday = withRouter(connect(
  mapStateToProps,
  mapDispatchToProps
)(RedirectYesterday));

})();
