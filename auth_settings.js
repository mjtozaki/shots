'use strict';

(function(ns = window) {

// Components.

// Validation function objects and component should be static, or else infinite loop.
//   https://github.com/erikras/redux-form/issues/2629
const required = value => (value || typeof value === 'number' ? undefined : 'Required');
const renderField = ({
  input,
  label,
  stateValue,
  type,
  meta: {touched, error},
}) => {
  const checkmark = img({
    src: 'https://cdnjs.cloudflare.com/ajax/libs/ionicons/4.5.6/collection/icon/svg/md-checkmark.svg',
    style: {
      width: '.75vw',
    },
  });
  return div([
    rhh.label(label),
    div([
      rhh.input('.screen-width-text-input', {...input, placeholder: label, type: type}),
      ...((touched && error) ? [span(error)] : []),
      ...((stateValue === input.value) ? [checkmark] : []),
    ]),
  ]);
};

class AuthSettings extends React.Component {
  render() {
    const {handleSubmit, onPurge, submitting} = this.props;
    
    let children = [];
    children.push(
      form({onSubmit: handleSubmit, key: 'form'}, [
        h(Field, {
          name: 'clientId',
          label: 'Client ID',
          component: renderField,
          key: 'clientId',
          type: 'text',
          validate: required,
          stateValue: this.props.auth.clientId}),
        h(Field, {
          name: 'clientSecret',
          label: 'Client Secret',
          component: renderField,
          key: 'clientSecret',
          type: 'text',
          validate: required,
          stateValue: this.props.auth.clientSecret}),
        h(Field, {
          name: 'refreshToken',
          label: 'Refresh Token',
          component: renderField,
          key: 'refreshToken',
          type: 'text',
          validate: required,
          stateValue: this.props.auth.refreshToken}),
        button({type: 'submit', disabled: submitting, key: 'submit'}, "Set"),
      ]),
      button({onClick: onPurge, key: 'purge'}, 'Purge Auth'),
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
