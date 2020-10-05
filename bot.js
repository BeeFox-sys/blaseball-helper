const dotenv = require("dotenv");
dotenv.config();

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

//Initalize Team Cache
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

//Command Handler
client.on("message",async (message)=>{
    //reject nonapplicable messages
    if(message.author.bot) return;
    if(message.guild?.id != process.env.GUILD) return;
    if(!message.content.startsWith(process.env.PREFIX)) return;

    //Grab the arguments and command from the message
    let args = message.content.substr(process.env.PREFIX.length).trim().split(" ");
    let command = args.shift();
    
    //if they just did the prefix, get outta there
    if(!command) return;
    
    //Set greeting command
    if(command.toLowerCase() == "setgreeting"){
        //Get the current team the user is on
        let roles = message.member.roles.cache.map(r=>r.id);
        let teams = teamCache.mget(roles);
        let teamData = teams[Object.keys(teams)[0]];

        if(!teamData) return message.channel.send("You are not yet part of a team");
        
        //Check to see if they are allowed to set the greeting
        if(!message.member.roles.cache.has(teamData.admin)) return message.channel.send("You do not have permission to do that!");

        //Update the db with the new info
        let db = await open({
            filename: "data.db",
            driver: sqlite3.Database
        });

        await db.run("update teams set message = ?1 where admin = ?2", args.join(" "), teamData.admin);

        //Confirm Change
        message.channel.send("Greeting Updated");

        //Refresh Cache
        initalizeCache();
    }

    //Test Greeting Command
    else if(command.toLowerCase() == "testgreeting"){
        //Find users team
        let roles = message.member.roles.cache.map(r=>r.id);
        let teams = teamCache.mget(roles);
        let teamData = teams[Object.keys(teams)[0]];

        if(!teamData) return message.channel.send("You are not yet part of a team");
        
        //Prepare the message by replacing neccissary parts
        let greeting = teamData.message;
        greeting = greeting.replace(/NAME/g, message.member.displayName);

        //Attempt to send the message
        message.member.send(greeting).catch(error=>{switch(error.message){
        case "Cannot send messages to this user": 
            message.reply("Your DMs are closed"); //If the bot is blocked, or the person has allow dms off
            break;
        default: 
            message.reply("Something went wrong"); //whoops
            console.error(error);
        }});
    }

    //Help command, it is what it looks like!
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

//Team Change Handling
client.on("guildMemberUpdate",(oldMember,newMember)=>{
    // Not of this guild? Need not apply
    if(newMember.guild.id != process.env.GUILD) return;

    //Grab the change in roles
    let differenceRoles = oldMember.roles.cache.difference(newMember.roles.cache);
    let oldRole = oldMember.roles.cache.intersect(differenceRoles).first();
    let newRole = newMember.roles.cache.intersect(differenceRoles).first();

    //Log the change in roles (Debugging Purposes)
    if(newRole) console.log(`${newMember.displayName}: + ${newRole.name}`);
    if(oldRole) console.log(`${newMember.displayName}: - ${oldRole.name}`);

    //If they didn't recieve a new role, then we are done here
    if(newRole == undefined) return;
    
    //Find the team of the new role, if there is none, why even bother?
    let teamData = teamCache.get(newRole.id);
    if(!teamData) return;

    //Check that they have been on the server within the appropriate time frame
    let joinDate = newMember.joinedAt;
    let checkDate = new Date();
    checkDate.setHours(checkDate.getHours()-process.env.JOINLENGTH);

    if(joinDate < checkDate) return;

    //Replace appropriate key words to make message more personallized
    let greeting = teamData.message;
    greeting = greeting.replace(/NAME/g, newMember.displayName);

    //Attempt to greet
    newMember.send(greeting).catch(error=>{switch(error.message){
    case "Cannot send messages to this user": 
        console.log(`Tried to greet ${newMember.displayName}, but their DMs are disabled!`); //it's 😔 okay
        break;
    default: console.error(error); //it's 😬 okay
    }});

});

client.on("ready",()=>{console.log("ready");});

client.login(process.env.TOKEN);