const User = require('./User');
const Setting = require('./Setting');
const Blacklist = require('./Blacklist');
const Chat = require('./Chat');
const Message = require('./Message');
const AlertLog = require('./AlertLog');

// Associations
Message.belongsTo(Chat, { foreignKey: 'ChatId' });
Chat.hasMany(Message, { foreignKey: 'ChatId' });

AlertLog.belongsTo(Chat, { foreignKey: 'ChatId' });
Chat.hasMany(AlertLog, { foreignKey: 'ChatId' });

module.exports = {
    User,
    Setting,
    Blacklist,
    Chat,
    Message,
    AlertLog
};
