module.exports = (sequelize, DataTypes) => {
  const Banner = sequelize.define('banner', {
    id_banner: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    banner_img: {
      type: DataTypes.STRING,
      allowNull: false
    },
    is_primary: {
      type:DataTypes.TINYINT,
      allowNull: true,
    },
    type: {
      type: DataTypes.TINYINT,
      allowNull:true,
    },
  }, {
    tableName: 'banner',
    timestamps: false
  });

  return Banner;
};
