'use strict';

(function(ns = window) {

// Component.
class ShotSharingWidget extends React.Component {
  render() {
    let children = [];
    children.push(
      button({onClick: this.props.goToSharingLinkResult}, 'Share (Link is result appended to "git.io/")'));
    
    // Shelved until we can do an asynchronous fetch of the sharing link.
    // if (this.props.shotSharingLinkGetSuccess === true) {
      // children.push(
        // // TODO: make this prettier.
        // h2(this.props.shotSharingLink));

    // } else if (this.props.shotSharingLinkGetSuccess === false) {
      // children.push(h2("Could not get a sharing link. Refresh and try again."));
    // }
    return children;
  }
}

// Props.
const mapStateToProps = state => ({
  shot: state.shot,
});
const mapDispatchToProps = (dispatch, ownProps) => ({
  goToSharingLinkResult: () => dispatch(goToSharingLinkResult()),
});

// Exports.
ns.ShotSharingWidget = connect(
  mapStateToProps,
  mapDispatchToProps,
)(ShotSharingWidget);

})();