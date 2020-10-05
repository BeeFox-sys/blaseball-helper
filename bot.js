const dotenv = require("dotenv");
dotenv.config();

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const NodeCache = require("node-cache");
const teamCache = new NodeCache();
async function initalizeCache(){
    let db = await open({
        filename: "data.db",
        driver: sqlite3.Database
    });
    let teams = await db.all("select * from teams;");
    for (const team of teams.values()) {
        teamCache.set(team.role, team);
    }
    console.log("Initalized Cache");
}

initalizeCache();

const { Client } = require("discord.js");
const client = new Client({disableMentions:"all"});

client.on("message",async (message)=>{
    if(message.author.bot) return;
    if(message.guild?.id != process.env.GUILD) return;
    if(!message.content.startsWith(process.env.PREFIX)) return;

    let args = message.content.substr(process.env.PREFIX.length).trim().split(" ");
    let command = args.shift();
    
    if(!command) return;
    
    if(command.toLowerCase() == "setgreeting"){
        let roles = message.member.roles.cache.map(r=>r.id);
        let teams = teamCache.mget(roles);
        let teamData = teams[Object.keys(teams)[0]];

        if(!teamData) return message.channel.send("You are not yet part of a team");
        
        if(!message.member.roles.cache.has(teamData.admin)) return message.channel.send("You do not have permission to do that!");

        let db = await open({
            filename: "data.db",
            driver: sqlite3.Database
        });

        await db.run("update teams set message = ?1 where admin = ?2", args.join(" "), teamData.admin);
        message.channel.send("Greeting Updated");
        initalizeCache();
    }
    else if(command.toLowerCase() == "testgreeting"){
        let roles = message.member.roles.cache.map(r=>r.id);
        let teams = teamCache.mget(roles);
        let teamData = teams[Object.keys(teams)[0]];

        if(!teamData) return message.channel.send("You are not yet part of a team");
        
        let greeting = teamData.message;
        greeting = greeting.replace(/NAME/g, message.member.displayName);

        message.member.send(greeting).catch(error=>{switch(error.message){
        case "Cannot send messages to this user": 
            message.reply("Your DMs are closed");
            break;
        default: 
            message.reply("Something went wrong");
            console.error(error);
        }});
    }
    else if(command.toLowerCase() == "help"){
        message.channel.send(
            `> **Info**
When a user joins a team within ${process.env.JOINLENGTH} hours of joining, they will receive a message set using the below commands.
> **Commands**
__${process.env.PREFIX}setgreeting <greeting>__
Sets the greeting to the text proceeding command. \`NAME\` will be replaced with the users name.
__${process.env.PREFIX}testgreeting__
Tests the greeting by sending it to you as if you were a new user
__${process.env.PREFIX}help__
Displays this message.
`
        );
    }

});

client.on("guildMemberUpdate",(oldMember,newMember)=>{
    if(newMember.guild.id != process.env.GUILD) return;
    let differenceRoles = oldMember.roles.cache.difference(newMember.roles.cache);
    let oldRole = oldMember.roles.cache.intersect(differenceRoles).first();
    let newRole = newMember.roles.cache.intersect(differenceRoles).first();
    if(newRole) console.log(`${newMember.displayName}: + ${newRole.name}`);
    if(oldRole) console.log(`${newMember.displayName}: - ${oldRole.name}`);

    if(newRole == undefined) return;
    
    let teamData = teamCache.get(newRole.id);
    if(!teamData) return;

    let joinDate = newMember.joinedAt;
    let checkDate = new Date();
    checkDate.setHours(checkDate.getHours()-process.env.JOINLENGTH);

    if(joinDate < checkDate) return;

    //Templater
    let greeting = teamData.message;
    greeting = greeting.replace(/NAME/g, newMember.displayName);

    newMember.send(greeting).catch(error=>{switch(error.message){
    case "Cannot send messages to this user": 
        console.log(`Tried to greet ${newMember.displayName}, but their DMs are disabled!`);
        break;
    default: console.error(error);
    }});

});

client.on("ready",()=>{console.log("ready");});

client.login(process.env.TOKEN);