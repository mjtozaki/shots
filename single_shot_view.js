'use strict';

(function(ns = window) {
// Components.
class SingleShotView extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    let children = [];
    children.push(
      h(SingleShotGraph, {
        shotData: this.props.shot,
      }));
    
    if (!this.props.byo) {
      // Data from shot storage. Allow sharing.
      // Turning off sharing until the implementation is solved.
      // children.push(
        // h(ShotSharingWidget));
    } else {
      // Bring your own data. Show link instead.
      children.push(
        h3('.normal-text', 'Share link: '),
        h3('.normal-link', decodeURIComponent(this.props.match.params.shortUrl)),
      );
    }
    // TODO: metadata
    return children;
  }
}

class SingleShotGraph extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {
    var shotData = this.props.shotData;
    if (shotData === undefined || shotData.lastFetched === undefined) {
      return [];
    }
    const weightPresent = shotData.flowWeight.some(value => value != 0);
    const flowAxisTitle = 'Flow (mL/s)' + (weightPresent ? ' or Weight (g/s)' : '');
    var pressure = {
      x: shotData.elapsed,
      y: shotData.pressure,
      mode: 'lines',
      name: 'Pressure',
      line: {
        color: 'green'
      }
    };
    var flow = {
      x: shotData.elapsed,
      y: shotData.flow,
      mode: 'lines',
      name: 'Flow',
      line: {
        color: 'blue'
      },
      yaxis: 'y2'
    };
    var flowWeight = {
      x: shotData.elapsed,
      y: shotData.flowWeight,
      mode: 'lines',
      name: 'Flow weight',
      line: {
        color: 'brown',
      },
      yaxis: 'y2',
    };
    var temperatureBasket = {
      x: shotData.elapsed,
      y: shotData.temperatureBasket,
      mode: 'lines',
      name: 'Basket Temperature',
      line: {
        color: 'red'
      },
      yaxis: 'y3'
    };
    var temperatureTarget = {
      x: shotData.elapsed,
      y: shotData.temperatureTarget,
      mode: 'lines',
      name: 'Target Basket Temperature',
      line: {
        color: 'red',
        dash: 'dash'
      },
      yaxis: 'y3'
    };

    // Pressure and flow ranges match DE app defaults.
    var pressureRange = [0, 12];
    var flowRange = [0, 6];
    const temperatureRange = [80, 98];
      
    var data = [pressure, flow, temperatureBasket, temperatureTarget];
    if (weightPresent) {
      data.push(flowWeight);
    }
    var layout = {
      titlefont: {
        family: 'Roboto',
      },
      title: `Shot @ ${shotData.timestamp}`,
//             showlegend: false,
      xaxis: {
        title: 'Elapsed (s)',
        domain: [0, 0.9],
      },
      yaxis: {
        title: 'Pressure (bar)',
        titlefont: {color: 'green'},
        tickfont: {color: 'green'},
        side: 'left',
        autorange: false,
        range: pressureRange,
      },
      yaxis2: {
        title: flowAxisTitle,
        titlefont: {color: 'blue'},
        tickfont: {color: 'blue'},
        anchor: 'x',
        overlaying: 'y',
        side: 'right',
        autorange: false,
        range: flowRange,
      },
      yaxis3: {
        title: 'Basket Temperature (C)',
        titlefont: {color: 'red'},
        tickfont: {color: 'red'},
        anchor: 'free',
        overlaying: 'y',
        side: 'right',
        position: 1,
        autorange: false,
        range: temperatureRange
      },
    };
    // React overwrites any existing plot.
    // Plotly.react(plot, data, layout);
    
    return h(Plot, '.single-shot-plot', {
      data: data,
      layout: layout,
    });
  }
}

////////// Over-the-network shot.
(function() {
  // Containers.
  class RoutedSingleShotView extends React.Component {
    componentDidMount() {
      // Fetch
      // TODO: do this without looking directly into auth state.
      if (this.props.auth.clientId !== undefined && this.props.auth.clientSecret !== undefined
          && this.props.auth.refreshToken !== undefined) {
        this.props.fetchShot(this.props.match.params.provider, this.props.match.params.shotId);
      } else {
        this.props.history.replace('/auth');
      }
      
    }

    componentDidUpdate(prevProps) {
      this.props.fetchShotIfNeeded(this.props.match.params.provider, this.props.match.params.shotId);
    }
    
    render() {
      return h(SingleShotView, {...this.props});
    }
  }

  // Props.
  let getShot = (shot) => {
    return shot;
  };
  let mapStateToProps = (state) => ({
    auth: state.auth,
    shot: getShot(state.shot),
  });
  let mapDispatchToProps = (dispatch, ownProps) => ({
    fetchShot: (provider, shotId) => {
      dispatch(fetchShot(provider, shotId));
    },
    fetchShotIfNeeded: (provider, shotId) => {
      dispatch(fetchShotIfNeeded(provider, shotId));
    },
  });

  // Exports.
  ns.RoutedSingleShotView = withRouter(connect(
    mapStateToProps,
    mapDispatchToProps,
  )(RoutedSingleShotView));
})();

////////// BYO shot.
(function() {
  // Container.
  class RoutedByoSingleShotView extends React.Component {
    componentDidMount() {
      this.props.deserializeShot(this.props.match.params.serializedShot);
    }
    componentDidUpdate(prevProps) {
      if (this.props.match.params.serializedShot !== prevProps.match.params.serializedShot) {
        this.componentDidMount();
      }
    }
    render() {
      return h(SingleShotView, {...this.props});
    }
  }

  // Props.
  let getShot = (shot) => {
    return shot;
  };
  let mapStateToProps = (state) => ({
    byo: true,
    shot: getShot(state.shot),
  });
  let mapDispatchToProps = (dispatch, ownProps) => ({
    deserializeShot: (serializedShot) => dispatch(deserializeShot(serializedShot)),
  });

  // Exports.
  ns.RoutedByoSingleShotView = withRouter(connect(
    mapStateToProps,
    mapDispatchToProps,
  )(RoutedByoSingleShotView));
})();

})();
