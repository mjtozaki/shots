'use strict';

(function(ns = window) {
// Components.
class ShotsList extends React.Component {
  render() {
    if (this.props.shots.list === undefined) {
      return [];
    }
    let lastDate = new Date(0);
    let lastDateCount = 0;
    let listDataWithDailyCount = this.props.shots.list
      .reduceRight((wrappers, shotId) => {
        let shot = this.props.shots.db[shotId];
        if (lastDate.toDateString() !== shot.date.toDateString()) {
          lastDate = shot.date;
          lastDateCount = 0;
        }
        let dailyCount = ++lastDateCount;
        wrappers.push({
          shotId: shotId,
          dailyCount: dailyCount,
        });
        return wrappers;
      },
      [])
      .reverse();
    let children = listDataWithDailyCount
      .map(
        ({shotId, dailyCount}) => h(ShotsListEntry, {
          dailyCount: dailyCount,
          shot: this.props.shots.db[shotId],
          key: shotId,
        }));
    return children;
  }
}

class ShotsListEntry extends React.Component {
  render() {
    // TODO: keep filters.
    let shotLocation = `/personal/drive/${this.props.shot.id}`;
    
    let formattedDate = moment(this.props.shot.date).format(`ddd MMM DD gggg (#${this.props.dailyCount}) HH:mm:ss ZZ`);
    let shotTitle = formattedDate;
    // TODO: this probably outputs a double '/' if child of root.
    let shotDetails = `${this.props.shot.parent.path}/${this.props.shot.name}`;
    return div('.shots-list-entry', [
      div('.shots-list-entry-title', [h(Link, {to: shotLocation}, shotTitle)]),
      div('.shots-list-entry-details', [h(Link, {to: shotLocation}, shotDetails)]),
    ]);
  }
}

// Containers.
class RoutedShotsList extends React.Component {
  componentDidMount() {
    // Fetch
    // TODO: do this without looking directly into auth state.
    if (this.props.auth.clientId !== undefined && this.props.auth.clientSecret !== undefined
        && this.props.auth.refreshToken !== undefined) {
      this.props.fetchShotsList();
    } else {
      this.props.history.replace('/auth');
    }      
  }

  componentDidUpdate(prevProps) {
    this.props.fetchShotsListIfNeeded();
  }
  
  render() {
    return h(ShotsList, {...this.props});
  }
}

// Props.
let getShots = (shots) => {
  return shots;
};
let mapStateToProps = (state) => ({
  auth: state.auth,
  shots: getShots(state.shots),
});
let mapDispatchToProps = (dispatch, ownProps) => ({
  fetchShotsList: () => {
    dispatch(fetchShotsList());
  },
  fetchShotsListIfNeeded: () => {
    dispatch(fetchShotsListIfNeeded());
  },
});

// Exports.
ns.RoutedShotsList = withRouter(connect(
  mapStateToProps,
  mapDispatchToProps,
)(RoutedShotsList));

})();
