'use string';

(function(ns = window) {
// Components.
class ShotsMenu extends React.Component {
  render() {
    var children = [];

    var mainMenuChildren = [
      // Left side: Navigation.
      h(Link, '.menu-item', {to: '/'}, 'shots'),
      h(Link, '.menu-item', {to: '/redirect/index/personal/drive/-1'}, 'last'),
      h(Link, '.menu-item', {to: '/redirect/yesterday'}, 'yesterday'),
      h(Link, '.menu-item', {to: '/redirect/index/personal/drive/0'}, 'first'),
      // Relative navigation.
      h(Route, {path: '/personal/:provider/:shotId', render: ({match: {params: {provider, shotId}}}) => [
        h(Link, '.menu-item', {to: `/redirect/from/personal/${provider}/${shotId}/-10`}, '-10'),
        h(Link, '.menu-item', {to: `/redirect/from/personal/${provider}/${shotId}/-1`}, '-1'),
        h(Link, '.menu-item', {to: `/redirect/from/personal/${provider}/${shotId}/1`}, '+1'),
      ]}),

      // Right side: Options toggle.
      a('.options-nav', {onClick: this.props.toggleOptionsMenu}, '\u00B7\u00B7\u00B7'),
    ];
    children.push(
      div('.menu-bar', mainMenuChildren),
    );
    
    if (this.props.options.menu.show) {
      children.push(
        div([
          h(Link, '.option-item', {to: '/auth'}, 'Auth settings'),
        ]),
      );
    }

    return children;
  }
}

// Props.
const mapStateToProps = state => ({
  options: state.options,
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  toggleOptionsMenu: () => dispatch(toggleOptionsMenu()),
});

// Exports.
ns.ShotsMenu = withRouter(connect(
  mapStateToProps,
  mapDispatchToProps
)(ShotsMenu));

})();