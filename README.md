
# Paradigm

Just bootstrapping the repo for the new API code

BEWARE at the moment this is entirely in flux


Some useful stuff from installs, make better instructions out of this:

apt install nodejs npm build-essential
npm install coffeescript

google chrome still requires manual install as well to use puppeteer
the default node install of puppeteer still failed to find its own install of chromium
see the puppet file for info on installing chrome

# install pm2, start the server, add to startup script, and save
# start with watch to restart on changes, and -i with a number to set how many instances to start (should be less than number of CPU available)
# https://pm2.keymetrics.io/docs/usage/cluster-mode/
npm i -g pm2
pm2 install pm2-logrotate
pm2 start <in your project directory> i- 3 --watch
pm2 startup
pm2 save
pm2 logs # will show log output and console.log
pm2 monit # a terminal monitor ui - note that pm2 logs can be easier for quickly following incoming requests, but monit gives some more overview stats
# logs default get written to ~/.pm2/logs

https://developers.cloudflare.com/workers

# installing an index server

adduser --gecos "" USERNAME
cd /home/USERNAME
mkdir /home/USERNAME/.ssh
chown USERNAME:USERNAME /home/USERNAME/.ssh
chmod 700 /home/USERNAME/.ssh
mv /root/.ssh/authorized_keys .ssh/
chown USERNAME:USERNAME .ssh/authorized_keys
chmod 600 /home/USERNAME/.ssh/authorized_keys
adduser USERNAME sudo
export VISUAL=vim

visudo
# USERNAME ALL=(ALL) NOPASSWD: ALL

apt-get update
apt-get -q -y install ntp nginx

dpkg-reconfigure tzdata
# set to Europe/London

dpkg-reconfigure --priority=low unattended-upgrades

vim /etc/ssh/sshd_config
# uncomment PubkeyAuthentication yes
# change PermitRootLogin no
# change PasswordAuthentication no

# on newer ssh, dsa keys have to be explicitly allowed although ideally they shouldn't be, as they're not so secure any more
# but to do so, add this line (this is necessary even to use them locally to access remotes)
# (note this didn't work so gave up, revisit if becomes critical)
# PubkeyAcceptedKeyTypes=+ssh-dss

service ssh restart

ufw allow 22
ufw allow 80
ufw allow 443
ufw enable

# install ES instructions: 
# https://opendistro.github.io/for-elasticsearch-docs/docs/install/deb/
# and link on that page for kibana too

# in /etc/elasticsearch
# set java min and max to same number in jvm.options
# enable bootstrap.memory_lock in elasticsearch.yml

# in jvm.options
# -Des.enforce.bootstrap.checks=true

# and see
# https://www.elastic.co/guide/en/elasticsearch/reference/current/important-settings.html
# https://www.elastic.co/guide/en/elasticsearch/reference/current/system-config.html
# https://www.elastic.co/guide/en/elasticsearch/reference/master/setting-system-settings.html

# /etc/systemd/system/elasticsearch.service.d/override.conf
# need to set the values in systemd override file (which needs to be created)
# [Service]
# LimitMEMLOCK=infinity
# LimitNPROC=4096
# LimitNOFILE=1024000

# after changing the above settings any time, also need to:
# sudo systemctl daemon-reload

# set elasticsearch and kibana to start at restart
# then start them

# if the bootstrap checks fail then it will show a startup warning and not start
# then status will tell of any problems. For example memlock not being possible
# and discovery settings being unsuitable for production
# for running a single-node instance (at least to begin with), add this to elasticsearch.yml
# discovery.type: single-node

# can check what ES does actually have rights to do like:
# curl -X GET "https://localhost:9200/_nodes/stats/process?filter_path=**.max_file_descriptors&pretty" -u admin:admin --insecure

# newer ES has no types, everything is an index. So it defaults to 1 shard so that shard count doesn't go up so fast
# (which it would, with index for everything instead of types in index)
# This is OK apart from where an index may be large. A good shard size is up to 50gb 
# so anything that may get bigger than that, manually create it first with more shards e.g
# https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-create-index.html
# curl -X PUT 'https://localhost:9200/my-index-000001?pretty' -u USERNAME:PASSWORD --insecure -H 'Content-Type: application/json' -d '{"settings": {"number_of_shards": 3}}'

# mappings and aliases can be sent there too. Because the new default ES dynamic 
# mapping handles the old .exact method as .keyword, hopefully the default dynamic is good enough now
# If not, different defaults can also be set in advance and applied to all new indexes if mappings aren't specified
# https://www.elastic.co/guide/en/elasticsearch/reference/current/index-templates.html

# with newer ubuntu 20.04 everything is systemd now as well. So restarting nginx is systemctl instead of old "service"
# sudo systemctl restart nginx
# sudo nginx -t still works though to test config changes

# if need certbot for encrypting ssl
sudo apt install certbot
# then configure the necessary domains and check they auto-renew
# note certbot behind CF can't do the nginx editing so do that directly. But once set up, should be able to autorenew. But check it.
# had to set CF to DNS only, no proxy, and uncomment ssl stuff in the nginx config and listen on 80.
# also could only do one domain at a time even though examples show multiples, they didn't work
# sudo certbot certonly --webroot --webroot-path /var/www/html -d DOMAIN_NAME_HERE
# once it succeeds, then re-edit the nginx configs to be 443 with ssl settings
# note also that although it is now certbot, the certs still end up in a folder called /etc/letsencrypt
# It looks like newer certbot automatically schedules itself, but check.
# NOTE also that for renewal to work with the certonly webroot method, the nginx config must listen on 80 to serve the response

# look into using new ES security stuff to secure queries direct to it
# note by default the opendistro will require admin user and insecure tag (see above)
# configure the ES and kibana default internal users, removing unnecessary ones or at least changing their PWs
# then these can be used as the connection privileges for remote connections
# https://opendistro.github.io/for-elasticsearch-docs/docs/security/configuration/yaml/
# note that doing all the security config is a bit of a hassle if not necessary. Main thing is changing the 
# default internal users. Easiest way to do that is to edit them as described before starting ES the first time.
# if ES was already started but no data loaded, just remove the nodes folder from wherever ES data is stored (/var/lib/elasticsearch by default)
# Note if using kibana it will also be necessary to have a kibana user and see /etc/kibana/kibana.yml 
# to configure that user if changed from the default one - which it should be, because anyone who knows the default setup could use it
# NOTE that trying to change the kibana users from the demo ones didn't work. Even when altering the roles-mapping as well. So kept the 
# same demo users but gave them new passwords (explained in the docs how to generate passwords)
# TODO: find out if any of the default certs and other security things mean there is a risk of default access.
# looks like default is only http basic auth activated.




