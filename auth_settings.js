'use strict';

(function(ns = window) {

// Components.

// Validation function objects and component should be static, or else infinite loop.
//   https://github.com/erikras/redux-form/issues/2629
const required = value => (value || typeof value === 'number' ? undefined : 'Required');
const renderField = ({
  input,
  label,
  type,
  meta: {touched, error},
}) => {
  return div([
    rhh.label(label),
    div([
      rhh.input('.screen-width-text-input', {...input, placeholder: label, type: type}),
      ...((touched && error) ? [span(error)] : []),
    ]),
  ]);
};

class AuthSettings extends React.Component {
  render() {
    const {handleSubmit, onPurge, submitting} = this.props;
    
    let children = [];
    children.push(
      form({onSubmit: handleSubmit}, [
        h(Field, {name: 'clientId', label: 'Client ID', component: renderField, type: 'text', validate: required}),
        h(Field, {name: 'clientSecret', label: 'Client Secret', component: renderField, type: 'text', validate: required}),
        h(Field, {name: 'refreshToken', label: 'Refresh Token', component: renderField, type: 'text', validate: required}),
        div([
          button({type: 'submit', disabled: submitting}, "Set"),
        ]),
      ]),
      button({onClick: onPurge}, 'Purge Auth'),
    );

    return children;
  }
}

// Props.
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

let RoutedAuthSettings = reduxForm({
  form: 'authSettingsForm',
})(AuthSettings);

RoutedAuthSettings = connect(
  mapStateToProps,
  mapDispatchToProps
)(RoutedAuthSettings);

// Exports.
ns.RoutedAuthSettings = RoutedAuthSettings;
  
})();
