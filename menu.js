'use string';

(function(ns = window) {

class RoutedShotsMenu extends React.Component {
  render() {
    return h(ShotsMenu, {...this.props});
  }
}

const mapStateToProps = state => ({
  options: state.options,
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  toggleOptionsMenu: () => dispatch(toggleOptionsMenu()),
});

ns.RoutedShotsMenu = withRouter(connect(
  mapStateToProps,
  mapDispatchToProps
)(RoutedShotsMenu));

})();