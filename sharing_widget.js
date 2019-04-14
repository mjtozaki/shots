'use strict';

(function(ns = window) {

// Component.
class ShotSharingWidget extends React.Component {
  render() {
    let children = [];
    children.push(
      button({
        onClick: () => this.props.fetchSharingLink(this.props.shot),
        disabled: this.props.sharing.fetching || this.props.sharing.available,
        key: 'button'}, 'Share'));
    
    if (this.props.sharing.fetching === true) {
      children.push(
        h2({key: 'fetching'}, "Generating."));

    } else if (this.props.sharing.available === true) {
      if (this.props.sharing.error !== undefined) {
        children.push(h2({key: 'error'}, "Could not get a sharing link. Refresh and try again."));
      } else {
        children.push(
          // TODO: make this prettier.
          h(CopyToClipboard, {
            onCopy: this.props.copiedSharingLink,
            text: this.props.sharing.link,
            key: 'CopyToClipboard',
          }, [
            h2({key: 'link'}, this.props.sharing.link),
          ]));
        if (this.props.sharing.copied) {
          children.push(
            h3('.copied-label', {key: 'copiedLabel'}, 'Copied!'));
        }
      }
    }
    return children;
  }
}

// Props.
const mapStateToProps = state => ({
  sharing: state.sharing,
  shot: state.shot,
});
const mapDispatchToProps = (dispatch, ownProps) => ({
  copiedSharingLink: () => dispatch(copiedSharingLink()),
  fetchSharingLink: shot => dispatch(fetchSharingLink(shot)),
});

// Exports.
ns.ShotSharingWidget = connect(
  mapStateToProps,
  mapDispatchToProps,
)(ShotSharingWidget);

})();