'use strict';

(function(ns = window) {
  

class DeferredAuthSettings extends React.Component {
  render() {
    return [
      h(AuthSettings, {...this.props}),
    ];
  }
}

// Using functional component causes infinite loop.
// let deferredAuthSettings = (props) => (
  // h(AuthSettings, {...props})
// );

const getInitialValues = auth => ({
  clientId: auth.clientId !== undefined ? auth.clientId : '',
  clientSecret: auth.clientSecret !== undefined ? auth.clientSecret : '',
  refreshToken: auth.refreshToken !== undefined ? auth.refreshToken : '',
});

const mapStateToProps = state => ({
  auth: state.auth,
  initialValues: getInitialValues(state.auth),
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSubmit: ({clientId, clientSecret, refreshToken}) => {
    dispatch(applyAuth({clientId, clientSecret, refreshToken}));
  },
  onPurge: () => {
    dispatch(purgeAuth());
  },
});

let RoutedAuthSettings;
  
RoutedAuthSettings = reduxForm({
  form: 'authSettingsForm',
})(DeferredAuthSettings);

// RoutedAuthSettings = withRouter(connect(
RoutedAuthSettings = connect(
  mapStateToProps,
  mapDispatchToProps
)(RoutedAuthSettings);
//);

ns.RoutedAuthSettings = RoutedAuthSettings;
  
})();
