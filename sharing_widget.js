'use strict';

(function(ns = window) {

class ShotSharingWidget extends React.Component {
  constructor(props) {
    super(props);
    this.state = {requestedShare: false};
  }
  
  render() {
    let children = [];
    children.push(
      button({
        onClick: this.props.goToSharingLinkResult /*() => {
          this.setState({requestedShare: true});
          this.props.requestLink();
        },
        disabled: this.state.requestedShare,*/
      }, 'Get sharing link from tinyurl'));
    
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

const mapStateToProps = state => ({
  shot: state.shot,
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  goToSharingLinkResult: () => dispatch(goToSharingLinkResult()),
});

ns.ShotSharingWidget = connect(
  mapStateToProps,
  mapDispatchToProps,
)(ShotSharingWidget);

})();