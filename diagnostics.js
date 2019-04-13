'use strict';

(function(ns = window) {

class Diagnostics extends React.Component {
  render() {
    const props = this.props;
    const diagVersion = '1.0';
    
    if (props.running !== true && props.done !== true) {
      // Launch diagnostics automatically if not already run.
      props.launchDiagnostics();
    }

    const diags = [
      {label: 'diagnostics version', value: diagVersion},
      {label: 'time of initial page load', value: new Date(initialLoadTime).toISOString()},
      {label: 'time of diagnostics render', value: new Date().toISOString()},
      {label: 'diagnostics done', value: props.running ? 'no' : 'yes'},
      {label: 'useragent', value: window.navigator.userAgent},
      {label: 'platform', value: window.navigator.platform},
      {label: 'oscpu', value: window.navigator.oscpu},
      {label: 'location', value: window.location.href},
      {label: 'local storage available', value: storageAvailable('localStorage') ? 'yes' : 'no'},
      {label: 'viewport width', value: window.innerWidth},
      {label: 'viewport height', value: window.innerHeight},
      {label: 'auth is set', value: props.authSet ? 'yes' : 'no'},
      {label: 'auth valid and working', value: props.authValid ? 'yes' : 'no'},
      {label: 'drive queryable for root directory', value: props.gotDriveRoot === true ? 'yes' : 'no'},
      {label: 'drive file count (all)', value: props.allFilesCount !== undefined ? props.allFilesCount : 'running'},
      {label: 'drive file count (.shots)', value: props.allShotsCount !== undefined ? props.allShotsCount : 'running'},
      {label: 'properly named (YYYYMMDDTHHmmSS.shot).shot files count', value: props.validShotsCount !== undefined ? props.validShotsCount : 'running'},
      {label: 'improperly named .shot files count', value: props.invalidShotsCount !== undefined ? props.invalidShotsCount : 'running'},
    ];
    
    const diagsText = diags
      .map(diag => `${diag.label}: ${diag.value}`)
      .join('\n');
    return [
      textarea({
        style: {width: '95vw', height: '95vh'},
        readOnly: true,
        value: diagsText,
        key: 'textarea'}),
      button({onSubmit: this.props.refresh, key: 'refresh'}, 'Refresh'),
    ];
  }
}

const mapStateToProps = state => ({
  authSet: (state.auth.clientId !== undefined && state.auth.clientSecret !== undefined
    && state.auth.refreshToken !== undefined),
  authValid: state.auth.valid,
  running: state.diag.running,
  done: state.diag.done,
  gotDriveRoot: state.diag.gotDriveRoot,
  allFilesCount: state.diag.allFilesCount,
  allShotsCount: state.diag.allShotsCount,
  validShotsCount: state.diag.validShotsCount,
  invalidShotsCount: state.diag.invalidShotsCount,
});

const mapDispatchToProps = dispatch => ({
  launchDiagnostics: () => dispatch(launchDiagnostics()),
  refresh: () => dispatch(refreshDiagnostics()),
});

ns.Diagnostics = connect(
  mapStateToProps,
  mapDispatchToProps
)(Diagnostics);

})();