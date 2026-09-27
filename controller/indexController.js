exports.getHome = async (req, res) => {
  res.render('homeView', { title: 'Honolulu Police Department arrest statistics' });
};
