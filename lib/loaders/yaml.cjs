module.exports = async function ( buffer, map, meta ) {
    const callback = this.async(),
        options = this.getOptions();

    if ( this.cacheable ) this.cacheable();

    const config = options.parseYamlConfig( buffer );

    callback( null, `export default ${JSON.stringify( config )}`, map, meta );
};
