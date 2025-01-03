const EmailTracking = require("../models/emailTracking.js");
const EmailReply = require("../models/emailReply.js");
const {updateResponseRate} = require("./analyticsController.js")
const {notifyCampaignOwner} = require("../services/socketService.js")

//This will generate a unique tracking url and save it to the database. This url will be embedded in the email and 
// will be used to track the email open events
const handleGenerateTrackingURL = async (req, res) => {
    
    const { recipientId, campaignId } = req.body;

    if (!recipientId || !campaignId) {
        return res.status(400).json({ error: 'recipientId and campaignId are required.' });
    }

    const trackingurl = `https://yourdomain.com/api/analytics/track?recipientId=${recipientId}&campaignId=${campaignId}`; // replace "yourdomain.com" with your actual domain

    try {

        const trackingData = await EmailTracking.create({ recipientId, campaignId , trackingurl});
        await trackingData.save();

        return res.status(200).json({ trackingurl });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate tracking URL.' });
    }
    
};


//This function will track the email open events and save time of email open
const handleEmailTracking = async (req, res) => {
  const { recipientId, campaignId } = req.query;

  if (!recipientId || !campaignId) {
      return res.status(400).send('Invalid tracking data.');
  }

  console.log(`Email opened by Recipient ID: ${recipientId}, Campaign ID: ${campaignId}`);

  try {
      // Look for the email tracking data in the database
      const emailTracking = await EmailTracking.findOne({ recipientId, campaignId });
      if (!emailTracking) {
          return res.status(400).send('Invalid tracking data.');
      }

      // Update the timestamp to the current time
      emailTracking.timestamp = new Date();
      await emailTracking.save();

      // Return a transparent 1x1 pixel image
      const transparentPixel = Buffer.from(
          '89504e470d0a1a0a0000000d49484452000000010000000101020000000000000000',
          'hex'
      );
      res.status(200).type('image/png').send(transparentPixel);
      
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal server error');
  }
};


// Stores timestamp of email reply belonging to a campaign ,updates email analytics and notifies campaign owner
const handleEmailReplies = async (req, res) => {
    
    const headers = req.headers;
    const inReplyTo = headers["in-reply-to"];
    if (!inReplyTo) {
      return res.status(400).send('Invalid tracking data: Missing In-Reply-To header.');
    }

    // Get the recipient ID from the request to whom email was sent by campaign
    const recipientId = req.body.from;
  
    try {
      // Find the original email using the 'In-Reply-To' message ID
      const originalEmail = await EmailReply.findOne({ messageId: inReplyTo , recipientId: recipientId});
  
      if (!originalEmail) {
        return res.status(404).send('Original email not found.');
      }
  
      // Update the timestamp of the original email to the current time
      originalEmail.timestamp = new Date();
      await originalEmail.save();

      await updateResponseRate(originalEmail.campaignId); // update respose rate in campaign analytics

      // Send a notification to the campaign owner
      const message = `You have new reply from recipient ID: ${recipientId} for campaign ID: ${originalEmail.campaignId}`;
      notifyCampaignOwner(originalEmail.campaignId, message); 
  
      return res.status(200).send('Email reply tracked successfully and response rate updated');
    } catch (error) {
        console.error('Error processing email reply:', error);
        return res.status(500).send('Internal server error.');
    }
  };
  


module.exports = { handleGenerateTrackingURL , handleEmailTracking ,handleEmailReplies};